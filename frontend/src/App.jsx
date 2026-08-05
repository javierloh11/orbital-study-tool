import "./App.css";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import Tesseract from "tesseract.js";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import jsPDF from "jspdf";
import CheatSheetEditor from "./CheatSheetEditor";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";

import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import Icon from "./components/ui/Icon";
import EmptyState from "./components/ui/EmptyState";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import { ToastProvider, useToast } from "./components/ui/Toast";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "default",
});

function MermaidDiagram({ chart }) {
  const containerRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const source = chart?.trim();

      if (!containerRef.current || !source) {
        return;
      }

      setRenderError("");
      containerRef.current.innerHTML = "";

      try {
        await mermaid.parse(source);

        const diagramId = `mermaid-${crypto.randomUUID()}`;
        const { svg } = await mermaid.render(diagramId, source);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error("Mermaid render error:", error);

        if (!cancelled) {
          setRenderError(
            error instanceof Error
              ? error.message
              : "The generated diagram contains invalid Mermaid syntax."
          );
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (renderError) {
    return (
      <div className="mermaid-error">
        <p>
          <strong>Diagram could not be rendered.</strong>
        </p>

        <details>
          <summary>Show diagram source</summary>
          <pre>{chart}</pre>
        </details>
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-diagram" />;
}

function MarkdownContent({ content, emptyMessage = "No content available." }) {
  if (!content) {
    return <p className="empty-resource-message">{emptyMessage}</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const languageMatch = /language-(\w+)/.exec(className || "");
            const language = languageMatch?.[1]?.toLowerCase();

            if (language === "mermaid") {
              return (
                <MermaidDiagram
                  chart={String(children).replace(/\n$/, "")}
                />
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function markdownSectionToHtml(section = "") {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "<p>No content available.</p>";
  }

  return lines
    .map((line) => {
      if (line.startsWith("### ")) {
        return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      }

      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }

      if (line.startsWith("# ")) {
        return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      }

      if (/^[-*]\s+/.test(line)) {
        return `<p>• ${escapeHtml(line.replace(/^[-*]\s+/, ""))}</p>`;
      }

      if (/^\d+\.\s+/.test(line)) {
        return `<p>${escapeHtml(line)}</p>`;
      }

      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("");
}

function splitMarkdownSections(markdown = "") {
  const source = markdown.trim();

  if (!source) {
    return [];
  }

  const lines = source.split("\n");
  const sections = [];
  let currentSection = [];

  const pushCurrentSection = () => {
    const content = currentSection.join("\n").trim();

    if (content) {
      sections.push(content);
    }

    currentSection = [];
  };

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+/.test(line);
    const isBullet = /^[-*]\s+/.test(line);
    const isNumberedItem = /^\d+\.\s+/.test(line);

    if (
      currentSection.length > 0 &&
      (isHeading || isBullet || isNumberedItem)
    ) {
      pushCurrentSection();
    }

    currentSection.push(line);
  }

  pushCurrentSection();

  return sections;
}

function extractMermaidChart(section = "") {
  const match = section.match(
    /```[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)```/i
  );

  if (!match) {
    return null;
  }

  return {
    chart: match[1].trim(),
    remainingText: section.replace(match[0], "").trim(),
  };
}

async function mermaidChartToDataUrl(chart) {
  const source = chart?.trim();

  if (!source) {
    throw new Error("Mermaid chart is empty.");
  }

  await mermaid.parse(source);

  const diagramId = `builder-mermaid-${crypto.randomUUID()}`;
  const { svg } = await mermaid.render(diagramId, source);

  const svgDataUrl =
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      const scale = 3;

      const width = image.naturalWidth || 1200;
      const height = image.naturalHeight || 800;

      canvas.width = width * scale;
      canvas.height = height * scale;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Could not create Mermaid canvas."));
        return;
      }

      context.scale(scale, scale);

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      context.drawImage(image, 0, 0, width, height);

      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => {
      reject(new Error("Failed to convert Mermaid diagram."));
    };

    image.src = svgDataUrl;
  });
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value._seconds === "number") return value._seconds * 1000;
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatNoteDate(value) {
  const millis = toMillis(value);

  if (!millis) {
    return "";
  }

  return new Date(millis).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ContentSkeleton() {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton" style={{ height: 18, width: "45%" }} />
      <div className="skeleton" style={{ height: 12, width: "95%" }} />
      <div className="skeleton" style={{ height: 12, width: "88%" }} />
      <div className="skeleton" style={{ height: 12, width: "92%" }} />
      <div className="skeleton" style={{ height: 18, width: "35%", marginTop: 10 }} />
      <div className="skeleton" style={{ height: 12, width: "90%" }} />
      <div className="skeleton" style={{ height: 12, width: "80%" }} />
    </div>
  );
}

function ResourceSectionPicker({
  content,
  emptyMessage,
  onAdd,
  onAddAll,
}) {
  const sections = splitMarkdownSections(content);

  if (!sections.length) {
    return (
      <p className="empty-resource-message">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <div className="builder-picker-header">
        <p>
          Select individual sections or add the entire resource.
        </p>

        <button
          type="button"
          className="builder-add-all-button"
          onClick={onAddAll}
        >
          Add all sections
        </button>
      </div>

      <div className="builder-resource-grid">
        {sections.map((section, index) => (
          <article
            key={`${index}-${section.slice(0, 30)}`}
            className="builder-resource-item"
          >
            <div className="builder-resource-preview">
              <MarkdownContent content={section} />
            </div>

            <button
              type="button"
              onClick={() => onAdd(section, index)}
            >
              Add to canvas
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

const RESOURCE_TABS = ["keypoints", "flashcards", "summary"];

const PAGE_TITLES = {
  dashboard: "Dashboard",
  upload: "Upload Notes",
  keypoints: "Study Resources",
  flashcards: "Study Resources",
  summary: "Study Resources",
  editor: "Cheat Sheet Builder",
  saved: "Saved Notes",
  subjectsummary: "Subject Summary",
};

const INPUT_METHODS = [
  {
    id: "paste",
    name: "Type or paste",
    icon: "type",
    desc: "Write or paste notes directly into the editor below.",
    format: "Manual text",
  },
  {
    id: "txt",
    name: "Text file",
    icon: "fileText",
    desc: "Upload a plain text file with your notes.",
    format: ".txt",
    accept: ".txt",
  },
  {
    id: "pdf",
    name: "PDF document",
    icon: "bookOpen",
    desc: "Extract text and lecture visuals from slides or notes.",
    format: ".pdf",
    accept: ".pdf",
  },
  {
    id: "image",
    name: "Image (OCR)",
    icon: "scan",
    desc: "Read text from photos of notes using OCR.",
    format: ".png .jpg .jpeg",
    accept: ".png,.jpg,.jpeg",
  },
];

function App() {
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [bootingAuth, setBootingAuth] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [notes, setNotes] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [summary, setSummary] = useState("");
  const [pdfPages, setPdfPages] = useState([]);
  const [selectedPdfPages, setSelectedPdfPages] = useState([]);
  const [subjectSummary, setSubjectSummary] = useState("");
  const [noteTitle, setNoteTitle] = useState("");

  const [flashcards, setFlashcards] = useState([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const [savedCurrentCard, setSavedCurrentCard] = useState(0);
  const [savedShowAnswer, setSavedShowAnswer] = useState(false);

  const [savedNotes, setSavedNotes] = useState([]);
  const [selectedSavedNote, setSelectedSavedNote] = useState(null);
  const [editingSavedNoteId, setEditingSavedNoteId] = useState(null);
  const [savedNoteDraft, setSavedNoteDraft] = useState(null);
  const [savedNoteSearch, setSavedNoteSearch] = useState("");
  const [savedNoteSort, setSavedNoteSort] = useState("newest");
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState("");

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  const [savedNoteTab, setSavedNoteTab] = useState("original");

  const [cheatSheetLayout, setCheatSheetLayout] = useState(null);
  const editorRef = useRef(null);
  const [editorSource, setEditorSource] = useState("keypoints");
  const [layoutDirty, setLayoutDirty] = useState(false);

  const [inputMethod, setInputMethod] = useState("paste");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        fetchSubjects(firebaseUser);
      }

      setBootingAuth(false);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSavedNotes = savedNotes
    .filter((note) =>
      (note.title || "Untitled Note")
        .toLowerCase()
        .includes(savedNoteSearch.trim().toLowerCase())
    )
    .sort((a, b) => {
      if (savedNoteSort === "title") {
        return (a.title || "Untitled Note").localeCompare(
          b.title || "Untitled Note"
        );
      }

      const aTime = toMillis(a.createdAt);
      const bTime = toMillis(b.createdAt);
      return savedNoteSort === "oldest" ? aTime - bTime : bTime - aTime;
    });

  async function fetchSubjects(currentUser = user) {
    try {
      if (!currentUser) return;

      const token = await currentUser.getIdToken();

      const response = await fetch(`${API_URL}/subjects`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (Array.isArray(data)) {
        setSubjects(data);
      }
    } catch (error) {
      console.error("Error fetching subjects:", error);
    }
  }

  async function registerUser() {
    try {
      setError("");

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      setUser(userCredential.user);
      await fetchSubjects(userCredential.user);
    } catch (error) {
      console.error("REGISTER ERROR:", error.code);

      if (error.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please log in instead.");
      } else if (error.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (error.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else {
        setError("Failed to register. Please try again.");
      }
    }
  }

  async function loginUser() {
    try {
      setError("");

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      setUser(userCredential.user);
      await fetchSubjects(userCredential.user);
    } catch (error) {
      console.error("LOGIN ERROR:", error.code);

      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential"
      ) {
        setError("No account found with this email, or the password is incorrect.");
      } else if (error.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (error.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else {
        setError("Failed to log in. Please check your email and password.");
      }
    }
  }

  async function submitAuth(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === "login") {
        await loginUser();
      } else {
        await registerUser();
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function logoutUser() {
    await signOut(auth);
    setUser(null);
    setSubjects([]);
    setSubject("");
    setSavedNotes([]);
  }

  const extractKeyPoints = async (inputNotes = notes) => {
    try {
      setLoading("Extracting key concepts...");
      setError("");

      const response = await fetch(`${API_URL}/api/process-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: inputNotes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract key points");
      }

      setKeyPoints(data.keyPoints);
      setActiveTab("keypoints");
    } catch (err) {
      console.error(err);
      setError("Failed to extract key points.");
    } finally {
      setLoading("");
    }
  };

  const handleFile = async (file) => {
    if (!file) return;

    setError("");
    setLoading("");

    if (file.name.endsWith(".txt")) {
      try {
        setLoading("Reading text file...");
        setUploadedFile({ name: file.name, type: "Text file" });

        const text = await file.text();
        setNotes(text);
        toast.info(
          "Text file loaded. Review and edit the text before generating key points."
        );
      } catch (err) {
        console.error(err);
        setError("Failed to read text file.");
        setUploadedFile(null);
      } finally {
        setLoading("");
      }
    } else if (file.name.endsWith(".pdf")) {
      try {
        setLoading("Extracting text and rendering PDF pages...");
        setUploadedFile({ name: file.name, type: "PDF document" });

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let pdfText = "";
        const renderedPages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          const pageText = textContent.items
            .map((item) => item.str)
            .join(" ");

          pdfText += `Page ${i}\n${pageText}\n\n`;

          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error(`Unable to render PDF page ${i}`);
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;

          renderedPages.push({
            pageNumber: i,
            text: pageText,
            imageUrl: canvas.toDataURL("image/jpeg", 0.75),
          });
        }

        setPdfPages(renderedPages);
        setSelectedPdfPages([]);
        setNotes(pdfText);

        await Promise.all([
          extractKeyPoints(pdfText),
          selectVisualPages(renderedPages),
        ]);
      } catch (err) {
        console.error(err);
        setPdfPages([]);
        setSelectedPdfPages([]);
        setUploadedFile(null);
        setError("Failed to read or render PDF file.");
      } finally {
        setLoading("");
      }
    } else if (
      file.name.endsWith(".png") ||
      file.name.endsWith(".jpg") ||
      file.name.endsWith(".jpeg")
    ) {
      try {
        setLoading("Reading image using OCR...");
        setUploadedFile({ name: file.name, type: "Image (OCR)" });

        const result = await Tesseract.recognize(file, "eng");
        const imageText = result.data.text.trim();

        setNotes(imageText);
        toast.info(
          "Image text extracted. Review and clean up the text before generating key points."
        );
      } catch (err) {
        console.error(err);
        setError("Failed to read image file.");
        setUploadedFile(null);
      } finally {
        setLoading("");
      }
    } else {
      setUploadedFile(null);
      setError("Please upload a .txt, .pdf, .png, .jpg, or .jpeg file only.");
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    handleFile(file);
  };

  async function selectVisualPages(pages) {
    try {
      const pageTextData = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
      }));

      const response = await fetch(
        `${API_URL}/api/select-visual-pages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pages: pageTextData,
          }),
        }
      );

      const data = await response.json();
      console.log("AI selected pages:", data.selectedPages);

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to select lecture visuals"
        );
      }

      setSelectedPdfPages(
        Array.isArray(data.selectedPages)
          ? data.selectedPages
          : []
      );
    } catch (error) {
      console.error("Visual page selection error:", error);
      setSelectedPdfPages([]);
    }
  }

  const generateFlashcards = async () => {
    try {
      setLoading("Generating flashcards...");
      setError("");

      const response = await fetch(`${API_URL}/api/flashcards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate flashcards");
      }

      setFlashcards(data.flashcards || []);
      setCurrentCard(0);
      setShowAnswer(false);
      setActiveTab("flashcards");
    } catch (err) {
      console.error(err);
      setError("Failed to generate flashcards.");
    } finally {
      setLoading("");
    }
  };

  const generateSummary = async () => {
    if (!keyPoints.trim()) {
      toast.info("Generate key points first — the summary is built from them.");
      return;
    }

    try {
      setLoading("Building summary sheet...");
      setError("");

      const response = await fetch(`${API_URL}/api/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keyPoints, }),
      });

      const data = await response.json();
      setSummary(data.summary);
      setActiveTab("summary");
    } catch (err) {
      console.error(err);
      setError("Failed to generate summary sheet.");
    } finally {
      setLoading("");
    }
  };

  async function addSubject() {
    try {
      if (!newSubject.trim()) return;

      const subjectName = newSubject.trim();
      const token = await user.getIdToken();

      await fetch(`${API_URL}/subjects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject: subjectName }),
      });

      if (!subjects.includes(subjectName)) {
        setSubjects([...subjects, subjectName]);
      }

      setSubject(subjectName);
      setNewSubject("");
      toast.success(`Subject "${subjectName}" created and selected.`);
    } catch (error) {
      console.error("Error adding subject:", error);
      setError("Failed to add subject.");
    }
  }

  async function saveNote() {
    if (!subject.trim()) {
      toast.error("Select or create a subject before saving.");
      return;
    }

    setLoading("Saving note...");
    try {
      const token = await user.getIdToken();
      const currentLayout = editorRef.current?.getPages?.() ?? cheatSheetLayout;

      const lectureVisuals = selectedPdfPages
        .map((pageNumber) =>
          pdfPages.find((page) => page.pageNumber === pageNumber)
        )
        .filter(Boolean)
        .map((page) => ({
          pageNumber: page.pageNumber,
          imageUrl: page.imageUrl,
        }));

      const payload = {
        subject,
        title: noteTitle.trim() || "Untitled Note",
        originalText: notes,
        keyPoints,
        flashcards,
        lectureVisuals,
        summary,
        layout: currentLayout,
        sourceType: pdfPages.length > 0 ? "pdf" : "text",
      };

      const isUpdating = Boolean(editingSavedNoteId);
      const url = isUpdating
        ? `${API_URL}/saved-notes/${subject}/${editingSavedNoteId}`
        : `${API_URL}/save-note`;

      const response = await fetch(url, {
        method: isUpdating ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save note");
      }

      toast.success(
        isUpdating ? "Note updated successfully." : "Note saved successfully."
      );
      setCheatSheetLayout(currentLayout);
      setLayoutDirty(false);

      if (isUpdating) {
        const updatedNote = {
          ...(selectedSavedNote || {}),
          ...payload,
          id: editingSavedNoteId,
        };

        setSavedNotes((current) =>
          current.map((note) =>
            note.id === editingSavedNoteId ? updatedNote : note
          )
        );
        setSelectedSavedNote(updatedNote);
      } else {
        setEditingSavedNoteId(data.id);
      }

      await fetchSubjects(user);
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error(error.message || "Failed to save note.");
    }
    setLoading("");
  }

  async function fetchSavedNote() {
    try {
      if (!user) {
        toast.error("Please log in first.");
        return;
      }

      if (!subject.trim()) {
        toast.info("Select a subject first to load its saved notes.");
        setActiveTab("saved");
        return;
      }

      setLoading("Loading saved notes...");
      setError("");

      const token = await user.getIdToken();

      const response = await fetch(
        `${API_URL}/saved-notes/${subject}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (Array.isArray(data)) {
        setSavedNotes(data);
        setEditingSavedNoteId(null);
        setSavedNoteDraft(null);

        if (data.length > 0) {
          setSelectedSavedNote(data[0]);
        } else {
          setSelectedSavedNote(null);
        }

        await fetchSavedSubjectSummary();
        setActiveTab("saved");
      } else {
        setSavedNotes([]);
        setSelectedSavedNote(null);
        setActiveTab("saved");
      }
    } catch (error) {
      console.error("Error fetching saved notes:", error);
      setError("Failed to fetch saved notes.");
    } finally {
      setLoading("");
    }
  }

  async function fetchSavedSubjectSummary() {
    if (!user || !subject) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `${API_URL}/subject-summary/${subject}/saved`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setSubjectSummary(data.summary || "");
      }
    } catch (error) {
      console.error("Failed to load saved subject summary:", error);
    }
  }

  async function generateSubjectSummary() {
    try {
      if (!subject) {
        toast.info("Select a subject first.");
        return;
      }

      setLoading("Generating subject summary...");
      const token = await user.getIdToken();

      const response = await fetch(
        `${API_URL}/subject-summary/${subject}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate subject summary");
      }

      setSubjectSummary(data.summary || "");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to generate subject summary.");
    } finally {
      setLoading("");
    }
  }

  async function saveSubjectSummary() {
    if (!subjectSummary.trim()) {
      toast.info("Generate or enter a subject summary first.");
      return;
    }

    try {
      setLoading("Saving subject summary...");
      const token = await user.getIdToken();
      const response = await fetch(
        `${API_URL}/subject-summary/${subject}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ summary: subjectSummary }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save subject summary");
      }

      toast.success("Subject summary saved successfully.");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to save subject summary.");
    } finally {
      setLoading("");
    }
  }

  function exportSubjectSummaryAsPDF() {
    if (!subjectSummary.trim()) {
      toast.info("There is no subject summary to export yet.");
      return;
    }

    const doc = new jsPDF();
    const margin = 15;
    const maxWidth = 180;
    const pageHeight = doc.internal.pageSize.height;
    let y = 20;

    doc.setFontSize(18);
    doc.text(`${subject || "Subject"} Summary Sheet`, margin, y);
    y += 12;
    doc.setFontSize(11);

    const plainText = subjectSummary
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/^[-*]\s+/gm, "• ");

    const lines = doc.splitTextToSize(plainText, maxWidth);
    lines.forEach((line) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 7;
    });

    doc.save(`${subject || "subject"}-summary.pdf`);
  }

  function openSavedNoteInBuilder(note) {
    if (!note) return;

    setSelectedSavedNote(note);
    setEditingSavedNoteId(note.id);
    setNoteTitle(note.title || "Untitled Note");
    setNotes(note.originalText || "");
    setKeyPoints(note.keyPoints || "");
    setSummary(note.summary || "");
    setFlashcards(Array.isArray(note.flashcards) ? note.flashcards : []);

    const visuals = Array.isArray(note.lectureVisuals)
      ? note.lectureVisuals
      : [];
    setPdfPages(
      visuals.map((visual) => ({
        pageNumber: visual.pageNumber,
        text: "",
        imageUrl: visual.imageUrl,
      }))
    );
    setSelectedPdfPages(visuals.map((visual) => visual.pageNumber));
    setCheatSheetLayout(note.layout || null);
    setActiveTab("editor");

    setTimeout(() => {
      editorRef.current?.loadPages(note.layout || null);
    }, 0);
  }

  function beginEditingSavedNote(note) {
    setSavedNoteDraft({
      title: note.title || "Untitled Note",
      originalText: note.originalText || "",
      keyPoints: note.keyPoints || "",
      summary: note.summary || "",
    });
  }

  async function updateSavedNoteContent() {
    if (!selectedSavedNote || !savedNoteDraft) return;

    try {
      setLoading("Updating saved note...");
      const token = await user.getIdToken();
      const response = await fetch(
        `${API_URL}/saved-notes/${subject}/${selectedSavedNote.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(savedNoteDraft),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update saved note");
      }

      const updatedNote = { ...selectedSavedNote, ...savedNoteDraft };
      setSavedNotes((current) =>
        current.map((note) =>
          note.id === updatedNote.id ? updatedNote : note
        )
      );
      setSelectedSavedNote(updatedNote);
      setSavedNoteDraft(null);
      toast.success("Saved note updated successfully.");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to update saved note.");
    } finally {
      setLoading("");
    }
  }

  async function deleteSavedNote(noteId) {
    try {
      const token = await user.getIdToken();

      await fetch(
        `${API_URL}/saved-notes/${subject}/${noteId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const updatedNotes = savedNotes.filter(
        (note) => note.id !== noteId
      );

      setSavedNotes(updatedNotes);

      if (editingSavedNoteId === noteId) {
        setEditingSavedNoteId(null);
        setCheatSheetLayout(null);
      }

      if (updatedNotes.length > 0) {
        setSelectedSavedNote(updatedNotes[0]);
      } else {
        setSelectedSavedNote(null);
      }

      toast.success("Note deleted.");
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Failed to delete note.");
    }
  }

  function requestDeleteSavedNote(note) {
    setConfirmDialog({
      title: "Delete this note?",
      message: `"${note.title || "Untitled Note"}" and all of its generated study resources will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete note",
      onConfirm: () => deleteSavedNote(note.id),
    });
  }

  const exportNoteAsPDF = (note) => {
    const doc = new jsPDF();

    let y = 20;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;
    const lineHeight = 8;
    const maxWidth = 180;

    const addText = (text) => {
      if (!text) return;

      const lines = doc.splitTextToSize(text, maxWidth);

      lines.forEach((line) => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 20;
        }

        doc.text(line, margin, y);
        y += lineHeight;
      });

      y += 4;
    };

    doc.setFontSize(18);
    doc.text(note.title || "Exported Note", margin, y);
    y += 12;

    doc.setFontSize(12);
    addText(`Subject: ${note.subject || "No subject"}`);

    doc.setFontSize(14);
    addText("Original Notes:");
    doc.setFontSize(11);
    addText(note.originalText || note.notes || "");

    doc.setFontSize(14);
    addText("Key Points:");
    doc.setFontSize(11);
    addText(note.keyPoints || "");

    doc.setFontSize(14);
    addText("Flashcards:");
    doc.setFontSize(11);
    if (Array.isArray(note.flashcards)) {
      note.flashcards.forEach((card, index) => {
        addText(`Q${index + 1}: ${card.question}`);
        addText(`A${index + 1}: ${card.answer}`);
      });
    }

    doc.setFontSize(14);
    addText("Summary:");
    doc.setFontSize(11);
    addText(note.summary || note.summarySheet || "");

    doc.save(`${note.title || "stitch-note"}.pdf`);
  };

  const openCheatSheetBuilder = () => {
    setActiveTab("editor");
  };

  const addResourceSectionToEditor = async (section, index) => {
    setActiveTab("editor");

    const mermaidContent = extractMermaidChart(section);

    try {
      if (mermaidContent) {
        const imageUrl = await mermaidChartToDataUrl(
          mermaidContent.chart
        );

        if (mermaidContent.remainingText) {
          editorRef.current?.addTextBlock(
            markdownSectionToHtml(
              mermaidContent.remainingText
            ),
            {
              x: 40 + (index % 3) * 30,
              y: 40 + (index % 5) * 30,
              width: 340,
              height: 100,
            }
          );
        }

        editorRef.current?.addImageBlock(
          { imageUrl },
          {
            x: 60 + (index % 3) * 30,
            y: mermaidContent.remainingText
              ? 160 + (index % 5) * 30
              : 40 + (index % 5) * 30,
            width: 480,
            height: 320,
          }
        );

        return;
      }

      editorRef.current?.addTextBlock(
        markdownSectionToHtml(section),
        {
          x: 40 + (index % 3) * 30,
          y: 40 + (index % 5) * 30,
        }
      );
    } catch (error) {
      console.error("Failed to add Mermaid diagram:", error);

      toast.error(
        `The Mermaid diagram could not be added: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const addFlashcardToEditor = (card, index) => {
    setActiveTab("editor");

    setTimeout(() => {
      editorRef.current?.addFlashcardBlock(card, {
        x: 50 + (index % 3) * 30,
        y: 50 + (index % 5) * 30,
      });
    }, 0);
  };

  const addVisualToEditor = (visual, index) => {
    setActiveTab("editor");

    setTimeout(() => {
      editorRef.current?.addImageBlock(
        {
          imageUrl: visual.imageUrl,
        },
        {
          x: 60 + (index % 3) * 30,
          y: 60 + (index % 5) * 30,
        }
      );
    }, 0);
  };

  const addAllSectionsToEditor = (content) => {
    const sections = splitMarkdownSections(content);

    if (!sections.length) {
      toast.info("There is no content available to add.");
      return;
    }

    setActiveTab("editor");

    setTimeout(() => {
      sections.forEach((section, index) => {
        editorRef.current?.addTextBlock(
          markdownSectionToHtml(section),
          {
            x: 30 + (index % 2) * 370,
            y: 30 + Math.floor(index / 2) * 190,
            width: 340,
            height: 160,
          }
        );
      });
    }, 0);
  };

  async function copyText(text, label = "Content") {
    if (!text || !text.trim()) {
      toast.info("There is nothing to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard.`);
    } catch (error) {
      console.error("Clipboard error:", error);
      toast.error("Could not copy to clipboard.");
    }
  }

  function navigate(viewId) {
    setMobileNavOpen(false);
    setError("");

    if (viewId === "resources") {
      setActiveTab("keypoints");
      return;
    }

    if (viewId === "saved") {
      if (subject.trim()) {
        fetchSavedNote();
      } else {
        setActiveTab("saved");
      }
      return;
    }

    if (viewId === "subjectsummary") {
      setActiveTab("subjectsummary");
      if (subject.trim()) {
        fetchSavedSubjectSummary();
      }
      return;
    }

    setActiveTab(viewId);
  }

  const activeNav = RESOURCE_TABS.includes(activeTab)
    ? "resources"
    : activeTab;

  const displayName =
    user?.displayName || (user?.email ? user.email.split("@")[0] : "");

  /* ================================================================
     Authentication screen
     ================================================================ */

  if (bootingAuth) {
    return (
      <div className="app-booting">
        <span className="spinner" />
        Loading Stitch.io…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-hero">
          <div className="auth-hero-brand">
            <span className="sidebar-brand-mark">
              <Icon name="logo" size={19} strokeWidth={2.2} />
            </span>
            Stitch.io
          </div>

          <div className="auth-hero-copy">
            <h2>Turn lecture notes into revision-ready study material.</h2>
            <p>
              Upload slides, notes or photos and let Stitch.io stitch them into
              key points, flashcards, summaries and printable cheat sheets.
            </p>

            <ul className="auth-hero-points">
              <li>
                <Icon name="checkCircle" size={17} />
                AI key points, flashcards and summaries
              </li>
              <li>
                <Icon name="checkCircle" size={17} />
                PDF, image OCR and manual text input
              </li>
              <li>
                <Icon name="checkCircle" size={17} />
                Drag-and-drop cheat sheet builder with PNG/PDF export
              </li>
            </ul>
          </div>

          <p className="auth-hero-footnote">
            Built for students. Your notes stay in your account.
          </p>
        </div>

        <div className="auth-panel">
          <div className="auth-card">
            <h1>
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="auth-card-sub">
              {authMode === "login"
                ? "Log in to access your saved notes, flashcards and summaries."
                : "Register to start building your personal revision library."}
            </p>

            <form className="auth-form" onSubmit={submitAuth} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="auth-email">
                  Email
                </label>
                <input
                  id="auth-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="auth-password">
                  Password
                </label>
                <div className="auth-password-wrap">
                  <input
                    id="auth-password"
                    className="input"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    placeholder={
                      authMode === "login"
                        ? "Your password"
                        : "At least 6 characters"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="banner banner-error" role="alert">
                  <Icon name="alertCircle" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                disabled={authLoading}
              >
                {authLoading && <span className="spinner" />}
                {authMode === "login" ? "Log in" : "Create account"}
              </button>
            </form>

            <p className="auth-switch">
              {authMode === "login"
                ? "New to Stitch.io?"
                : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setAuthMode(authMode === "login" ? "register" : "login");
                }}
              >
                {authMode === "login" ? "Create an account" : "Log in instead"}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     Authenticated shell
     ================================================================ */

  const hasAnyNoteContent = Boolean(notes.trim());
  const noteResourceCount =
    (keyPoints.trim() ? 1 : 0) +
    (summary.trim() ? 1 : 0) +
    (flashcards.length ? 1 : 0);

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeNav}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        subject={subject}
        userEmail={user.email}
        onLogout={logoutUser}
      />

      <div className="app-main">
        <TopBar
          pageTitle={PAGE_TITLES[activeTab] || "Stitch.io"}
          subject={subject}
          userEmail={user.email}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onLogout={logoutUser}
        />

        <main className="app-content">
          {(loading || error) && (
            <div className="global-status">
              {loading && (
                <span className="status-pill" role="status">
                  <span className="spinner" />
                  {loading}
                </span>
              )}

              {error && (
                <div className="banner banner-error" role="alert">
                  <Icon name="alertCircle" size={16} />
                  <span style={{ flex: 1 }}>{error}</span>
                  <button
                    type="button"
                    className="toast-dismiss"
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---------------- Dashboard ---------------- */}

          {activeTab === "dashboard" && (
            <>
              <div className="dashboard-welcome">
                <h2>
                  Welcome back{displayName ? `, ${displayName}` : ""}
                </h2>
                <p>What would you like to study today?</p>
              </div>

              <div className="dashboard-grid">
                <div className="card stat-card">
                  <span className="stat-card-icon">
                    <Icon name="folder" size={19} />
                  </span>
                  <div>
                    <div className="stat-card-value">{subjects.length}</div>
                    <div className="stat-card-label">
                      {subjects.length === 1 ? "Subject" : "Subjects"}
                    </div>
                  </div>
                </div>

                <div className="card stat-card">
                  <span className="stat-card-icon">
                    <Icon name="fileText" size={19} />
                  </span>
                  <div>
                    <div className="stat-card-value">{savedNotes.length}</div>
                    <div className="stat-card-label">
                      Saved notes{subject ? ` in ${subject}` : " loaded"}
                    </div>
                  </div>
                </div>

                <div className="card stat-card">
                  <span className="stat-card-icon accent">
                    <Icon name="cards" size={19} />
                  </span>
                  <div>
                    <div className="stat-card-value">{flashcards.length}</div>
                    <div className="stat-card-label">Flashcards ready</div>
                  </div>
                </div>

                <div className="card stat-card">
                  <span className="stat-card-icon accent">
                    <Icon name="image" size={19} />
                  </span>
                  <div>
                    <div className="stat-card-value">
                      {selectedPdfPages.length}
                    </div>
                    <div className="stat-card-label">Lecture visuals</div>
                  </div>
                </div>
              </div>

              {subjects.length === 0 ? (
                <section className="dashboard-section">
                  <div className="card">
                    <EmptyState
                      icon="sparkles"
                      title="Let's set up your study space"
                      text="Three quick steps: create a subject, upload your lecture notes, then generate key points, flashcards and summaries with AI."
                    >
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate("upload")}
                      >
                        <Icon name="folderPlus" size={16} />
                        Create your first subject
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate("upload")}
                      >
                        <Icon name="upload" size={16} />
                        Upload notes
                      </button>
                    </EmptyState>
                  </div>
                </section>
              ) : (
                <section className="dashboard-section">
                  <h3 className="dashboard-section-title">Quick actions</h3>

                  <div className="quick-actions">
                    <button
                      type="button"
                      className="card quick-action"
                      onClick={() => navigate("upload")}
                    >
                      <span className="quick-action-icon">
                        <Icon name="upload" size={18} />
                      </span>
                      <span className="quick-action-title">
                        Upload new notes
                        <Icon name="arrowRight" size={15} />
                      </span>
                      <span className="quick-action-text">
                        Paste text or upload PDFs, text files and photos to
                        start a new study set.
                      </span>
                    </button>

                    <button
                      type="button"
                      className="card quick-action"
                      onClick={() => navigate("saved")}
                    >
                      <span className="quick-action-icon">
                        <Icon name="folder" size={18} />
                      </span>
                      <span className="quick-action-title">
                        View saved notes
                        <Icon name="arrowRight" size={15} />
                      </span>
                      <span className="quick-action-text">
                        Reopen previous study sets with their key points,
                        flashcards and layouts.
                      </span>
                    </button>

                    <button
                      type="button"
                      className="card quick-action"
                      onClick={() => navigate("subjectsummary")}
                    >
                      <span className="quick-action-icon">
                        <Icon name="bookOpen" size={18} />
                      </span>
                      <span className="quick-action-title">
                        Subject summary
                        <Icon name="arrowRight" size={15} />
                      </span>
                      <span className="quick-action-text">
                        Combine every saved note in a subject into one revision
                        sheet.
                      </span>
                    </button>

                    <button
                      type="button"
                      className="card quick-action"
                      onClick={() => navigate("editor")}
                    >
                      <span className="quick-action-icon">
                        <Icon name="layout" size={18} />
                      </span>
                      <span className="quick-action-title">
                        Cheat Sheet Builder
                        <Icon name="arrowRight" size={15} />
                      </span>
                      <span className="quick-action-text">
                        Arrange your generated resources on a page and export as
                        PNG or PDF.
                      </span>
                    </button>

                    {hasAnyNoteContent && (
                      <button
                        type="button"
                        className="card quick-action"
                        onClick={() => navigate("resources")}
                      >
                        <span className="quick-action-icon">
                          <Icon name="sparkles" size={18} />
                        </span>
                        <span className="quick-action-title">
                          Continue current note
                          <Icon name="arrowRight" size={15} />
                        </span>
                        <span className="quick-action-text">
                          {noteTitle.trim() || "Untitled Note"} —{" "}
                          {noteResourceCount} of 3 resources generated.
                        </span>
                      </button>
                    )}

                    {flashcards.length > 0 && (
                      <button
                        type="button"
                        className="card quick-action"
                        onClick={() => setActiveTab("flashcards")}
                      >
                        <span className="quick-action-icon">
                          <Icon name="zap" size={18} />
                        </span>
                        <span className="quick-action-title">
                          Continue studying
                          <Icon name="arrowRight" size={15} />
                        </span>
                        <span className="quick-action-text">
                          Resume Study Mode — card {currentCard + 1} of{" "}
                          {flashcards.length}.
                        </span>
                      </button>
                    )}
                  </div>
                </section>
              )}

              <section className="dashboard-section">
                <h3 className="dashboard-section-title">Recent saved notes</h3>

                {filteredSavedNotes.length === 0 ? (
                  <div className="card">
                    <EmptyState
                      icon="folder"
                      title="No saved notes loaded"
                      text={
                        subject
                          ? `Open Saved Notes to load your ${subject} library.`
                          : "Select a subject and open Saved Notes to load your library."
                      }
                    >
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate("saved")}
                      >
                        <Icon name="folder" size={16} />
                        Open Saved Notes
                      </button>
                    </EmptyState>
                  </div>
                ) : (
                  <div className="recent-notes-grid">
                    {filteredSavedNotes.slice(0, 3).map((note) => (
                      <button
                        type="button"
                        key={note.id}
                        className="card note-card"
                        onClick={() => {
                          setSelectedSavedNote(note);
                          setSavedNoteTab("original");
                          setSavedCurrentCard(0);
                          setSavedShowAnswer(false);
                          setSavedNoteDraft(null);
                          setActiveTab("saved");
                        }}
                      >
                        <div className="note-card-top">
                          <span className="note-card-title">
                            {note.title || "Untitled Note"}
                          </span>
                          {formatNoteDate(note.createdAt) && (
                            <span className="note-card-date">
                              <Icon name="clock" size={12} />
                              {formatNoteDate(note.createdAt)}
                            </span>
                          )}
                        </div>

                        {note.originalText && (
                          <span className="note-card-preview">
                            {note.originalText.slice(0, 140)}
                          </span>
                        )}

                        <span className="note-card-badges">
                          {note.keyPoints && (
                            <span className="badge badge-primary">
                              Key points
                            </span>
                          )}
                          {Array.isArray(note.flashcards) &&
                            note.flashcards.length > 0 && (
                              <span className="badge badge-primary">
                                {note.flashcards.length} cards
                              </span>
                            )}
                          {note.summary && (
                            <span className="badge badge-neutral">Summary</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ---------------- Upload workspace ---------------- */}

          {activeTab === "upload" && (
            <div className="workflow">
              <section className="card workflow-step">
                <header className="workflow-step-header">
                  <span className="workflow-step-number">1</span>
                  <h3 className="workflow-step-title">Select a subject</h3>
                  <span className="workflow-step-hint">
                    Notes are organised and saved per subject
                  </span>
                </header>

                <div className="workflow-step-body">
                  <div className="subject-row">
                    <div className="field">
                      <label className="field-label" htmlFor="subject-select">
                        Active subject
                      </label>
                      <select
                        id="subject-select"
                        className="select"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      >
                        <option value="">Select a subject</option>
                        {subjects.map((subj) => (
                          <option key={subj} value={subj}>
                            {subj}
                          </option>
                        ))}
                      </select>
                      {subjects.length === 0 && (
                        <span className="field-hint">
                          No subjects yet — create your first one on the right.
                        </span>
                      )}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="subject-new">
                        Create a new subject
                      </label>
                      <div className="subject-create-row">
                        <input
                          id="subject-new"
                          className="input"
                          placeholder="e.g. CH2101 Thermodynamics"
                          value={newSubject}
                          onChange={(e) => setNewSubject(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addSubject();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={addSubject}
                          disabled={!newSubject.trim()}
                        >
                          <Icon name="plus" size={15} />
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card workflow-step">
                <header className="workflow-step-header">
                  <span className="workflow-step-number">2</span>
                  <h3 className="workflow-step-title">Name this note</h3>
                </header>

                <div className="workflow-step-body">
                  <div className="field">
                    <label className="field-label" htmlFor="note-title">
                      Note title
                    </label>
                    <input
                      id="note-title"
                      className="input"
                      placeholder="e.g. Lecture 4 — Enzyme Kinetics"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <section className="card workflow-step">
                <header className="workflow-step-header">
                  <span className="workflow-step-number">3</span>
                  <h3 className="workflow-step-title">Choose an input method</h3>
                </header>

                <div className="workflow-step-body">
                  <div className="method-grid">
                    {INPUT_METHODS.map((method) => (
                      <button
                        type="button"
                        key={method.id}
                        className={`method-card ${
                          inputMethod === method.id ? "selected" : ""
                        }`}
                        onClick={() => setInputMethod(method.id)}
                        aria-pressed={inputMethod === method.id}
                      >
                        <span className="method-card-icon">
                          <Icon name={method.icon} size={17} />
                        </span>
                        <span className="method-card-name">{method.name}</span>
                        <span className="method-card-desc">{method.desc}</span>
                        <span className="method-card-format">
                          {method.format}
                        </span>
                      </button>
                    ))}
                  </div>

                  {inputMethod !== "paste" && (
                    <>
                      <label
                        className={`dropzone ${dragOver ? "dragging" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          handleFile(file);
                        }}
                      >
                        <span className="dropzone-icon">
                          <Icon name="upload" size={20} />
                        </span>
                        <span className="dropzone-title">
                          Drag & drop your file here, or{" "}
                          <span>browse</span>
                        </span>
                        <span className="dropzone-hint">
                          Supported:{" "}
                          {INPUT_METHODS.find((m) => m.id === inputMethod)
                            ?.format || "files"}
                        </span>
                        <input
                          type="file"
                          className="visually-hidden"
                          accept={
                            INPUT_METHODS.find((m) => m.id === inputMethod)
                              ?.accept || ".txt,.pdf,.png,.jpg,.jpeg"
                          }
                          onChange={handleFileUpload}
                        />
                      </label>

                      {uploadedFile && (
                        <div className="dropzone-file">
                          <Icon name="fileText" size={17} />
                          <div style={{ minWidth: 0 }}>
                            <div className="dropzone-file-name">
                              {uploadedFile.name}
                            </div>
                            <div className="dropzone-file-type">
                              {uploadedFile.type}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setUploadedFile(null)}
                          >
                            <Icon name="x" size={14} />
                            Clear
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {inputMethod === "paste" && (
                    <p className="generation-note">
                      Type or paste your notes into the editor in step 4 below.
                    </p>
                  )}
                </div>
              </section>

              <section className="card workflow-step">
                <header className="workflow-step-header">
                  <span className="workflow-step-number">4</span>
                  <h3 className="workflow-step-title">
                    Review & edit your notes
                  </h3>
                  <span className="workflow-step-hint">
                    Clean up OCR or PDF text before generating
                  </span>
                </header>

                <div className="workflow-step-body">
                  <textarea
                    className="textarea notes-textarea"
                    placeholder="Paste or type your study notes here…"
                    aria-label="Study notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="notes-meta">
                    <span>
                      Review and edit before generating — especially text from
                      OCR image uploads.
                    </span>
                    <span>{notes.length.toLocaleString()} characters</span>
                  </div>
                </div>
              </section>

              <section className="card workflow-step">
                <header className="workflow-step-header">
                  <span className="workflow-step-number">5</span>
                  <h3 className="workflow-step-title">
                    Generate study resources
                  </h3>
                </header>

                <div className="workflow-step-body">
                  <div className="generation-toolbar">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => extractKeyPoints()}
                      disabled={loading !== "" || !hasAnyNoteContent}
                      title={
                        !hasAnyNoteContent
                          ? "Add some notes first"
                          : "Extract the key concepts from your notes"
                      }
                    >
                      <Icon name="sparkles" size={16} />
                      Key Points
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={generateFlashcards}
                      disabled={loading !== "" || !hasAnyNoteContent}
                      title={
                        !hasAnyNoteContent
                          ? "Add some notes first"
                          : "Generate question-and-answer flashcards"
                      }
                    >
                      <Icon name="cards" size={16} />
                      Flashcards
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={generateSummary}
                      disabled={loading !== "" || !keyPoints.trim()}
                      title={
                        !keyPoints.trim()
                          ? "Generate key points first — the summary is built from them"
                          : "Build a concise revision summary"
                      }
                    >
                      <Icon name="fileText" size={16} />
                      Summary Sheet
                    </button>

                    <span className="generation-toolbar-spacer" />

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={saveNote}
                      disabled={loading !== ""}
                    >
                      <Icon name="save" size={16} />
                      {editingSavedNoteId ? "Update Note" : "Save Note"}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fetchSavedNote}
                      disabled={loading !== ""}
                    >
                      <Icon name="folder" size={16} />
                      View Saved Notes
                    </button>
                  </div>

                  <p className="generation-note">
                    Uploaded PDF files automatically generate key points and
                    select lecture visuals. Summaries are built from generated
                    key points.
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* ---------------- Study resources ---------------- */}

          {RESOURCE_TABS.includes(activeTab) && (
            <>
              <div className="resource-tabs" role="tablist" aria-label="Study resources">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "keypoints"}
                  className={`resource-tab ${
                    activeTab === "keypoints" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("keypoints")}
                >
                  <Icon name="sparkles" size={15} />
                  Key Points
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "flashcards"}
                  className={`resource-tab ${
                    activeTab === "flashcards" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("flashcards")}
                >
                  <Icon name="cards" size={15} />
                  Flashcards
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "summary"}
                  className={`resource-tab ${
                    activeTab === "summary" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("summary")}
                >
                  <Icon name="fileText" size={15} />
                  Summary Sheet
                </button>
              </div>

              {activeTab === "keypoints" && (
                <section className="study-resource-sheet">
                  <header className="study-resource-header">
                    <div className="resource-header-row">
                      <div>
                        <p className="study-resource-label">
                          AI Revision Resource
                        </p>
                        <h2>Key Points</h2>
                      </div>

                      <div className="resource-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => copyText(keyPoints, "Key points")}
                          disabled={!keyPoints.trim()}
                        >
                          <Icon name="copy" size={14} />
                          Copy
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => extractKeyPoints()}
                          disabled={loading !== "" || !hasAnyNoteContent}
                        >
                          <Icon name="refresh" size={14} />
                          Regenerate
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={openCheatSheetBuilder}
                          disabled={!keyPoints.trim()}
                        >
                          <Icon name="layout" size={14} />
                          Add in Builder
                        </button>
                      </div>
                    </div>
                    <p>
                      The most important concepts extracted from your uploaded
                      notes.
                    </p>
                  </header>

                  <div className="study-resource-content">
                    {loading.startsWith("Extracting") ? (
                      <ContentSkeleton />
                    ) : keyPoints ? (
                      <MarkdownContent content={keyPoints} />
                    ) : (
                      <EmptyState
                        icon="sparkles"
                        title="No key points yet"
                        text="Upload or paste your notes, then generate key points to see the core concepts here."
                      >
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => navigate("upload")}
                        >
                          <Icon name="upload" size={16} />
                          Go to Upload Notes
                        </button>
                      </EmptyState>
                    )}
                  </div>
                </section>
              )}

              {activeTab === "flashcards" && (
                <section className="study-resource-sheet">
                  <header className="study-resource-header">
                    <div className="resource-header-row">
                      <div>
                        <p className="study-resource-label">
                          Active Recall Resource
                        </p>
                        <h2>Flashcards</h2>
                      </div>

                      <div className="resource-actions">
                        {flashcards.length > 0 && (
                          <span className="badge badge-primary">
                            {flashcards.length}{" "}
                            {flashcards.length === 1 ? "card" : "cards"}
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={generateFlashcards}
                          disabled={loading !== "" || !hasAnyNoteContent}
                        >
                          <Icon name="refresh" size={14} />
                          Regenerate
                        </button>
                      </div>
                    </div>
                    <p>
                      Review one question at a time and reveal the answer when
                      ready.
                    </p>
                  </header>

                  <div className="study-resource-content">
                    {loading.startsWith("Generating flashcards") ? (
                      <ContentSkeleton />
                    ) : flashcards.length === 0 ? (
                      <EmptyState
                        icon="cards"
                        title="No flashcards yet"
                        text="Generate flashcards from your notes to start an active recall study session."
                      >
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => navigate("upload")}
                        >
                          <Icon name="upload" size={16} />
                          Go to Upload Notes
                        </button>
                      </EmptyState>
                    ) : (
                      <div className="flashcard-study">
                        <div className="flashcard-progress-row">
                          <span>
                            Card {currentCard + 1} of {flashcards.length}
                          </span>

                          <div className="flashcard-progress-track">
                            <div
                              className="flashcard-progress-fill"
                              style={{
                                width: `${
                                  ((currentCard + 1) / flashcards.length) * 100
                                }%`,
                              }}
                            />
                          </div>
                        </div>

                        <article className="flashcard-study-card">
                          <p className="flashcard-section-label">Question</p>

                          <h3 className="flashcard-question">
                            {flashcards[currentCard].question}
                          </h3>

                          {showAnswer ? (
                            <div className="flashcard-answer-panel">
                              <p className="flashcard-section-label">Answer</p>

                              <p className="flashcard-answer-text">
                                {flashcards[currentCard].answer}
                              </p>
                            </div>
                          ) : (
                            <p className="flashcard-hidden-hint">
                              Try answering before revealing the response.
                            </p>
                          )}
                        </article>

                        <div className="flashcard-study-controls">
                          <button
                            className="study-control-button secondary"
                            disabled={currentCard === 0}
                            onClick={() => {
                              setCurrentCard((prev) => Math.max(prev - 1, 0));
                              setShowAnswer(false);
                            }}
                          >
                            <Icon name="chevronLeft" size={16} />
                            Previous
                          </button>

                          <button
                            className="study-control-button primary"
                            onClick={() => setShowAnswer((current) => !current)}
                          >
                            {showAnswer ? "Hide Answer" : "Show Answer"}
                          </button>

                          <button
                            className="study-control-button secondary"
                            disabled={currentCard === flashcards.length - 1}
                            onClick={() => {
                              setCurrentCard((prev) =>
                                Math.min(prev + 1, flashcards.length - 1)
                              );
                              setShowAnswer(false);
                            }}
                          >
                            Next
                            <Icon name="chevronRight" size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeTab === "summary" && (
                <section className="summary-sheet">
                  <header className="summary-sheet-header">
                    <div className="resource-header-row">
                      <div>
                        <p className="summary-sheet-label">
                          AI Revision Resource
                        </p>
                        <h2>Summary Sheet</h2>
                      </div>

                      <div className="resource-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => copyText(summary, "Summary")}
                          disabled={!summary.trim()}
                        >
                          <Icon name="copy" size={14} />
                          Copy
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={generateSummary}
                          disabled={loading !== "" || !keyPoints.trim()}
                        >
                          <Icon name="refresh" size={14} />
                          Regenerate
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={openCheatSheetBuilder}
                          disabled={!summary.trim()}
                        >
                          <Icon name="layout" size={14} />
                          Add in Builder
                        </button>
                      </div>
                    </div>
                    <p>
                      A concise revision guide generated from your extracted key
                      points.
                    </p>
                  </header>

                  <div className="summary-sheet-content">
                    {loading.startsWith("Building summary") ? (
                      <ContentSkeleton />
                    ) : (
                      <MarkdownContent
                        content={summary}
                        emptyMessage="No summary sheet generated yet. Generate key points first, then build the summary."
                      />
                    )}
                  </div>

                  {selectedPdfPages.length > 0 && (
                    <section className="lecture-visuals-section">
                      <div className="lecture-visuals-header">
                        <div>
                          <p className="summary-sheet-label">
                            From your uploaded notes
                          </p>
                          <h3>Important Lecture Visuals</h3>
                        </div>

                        <span className="visual-count">
                          {selectedPdfPages.length} selected
                        </span>
                      </div>

                      <div className="lecture-visuals">
                        {selectedPdfPages.map((pageNumber) => {
                          const page = pdfPages.find(
                            (item) => item.pageNumber === pageNumber
                          );

                          if (!page) return null;

                          return (
                            <figure key={page.pageNumber} className="lecture-page">
                              <div className="lecture-page-heading">
                                <span>Lecture visual</span>
                                <strong>Page {page.pageNumber}</strong>
                              </div>

                              <img
                                src={page.imageUrl}
                                alt={`Important lecture visual from page ${page.pageNumber}`}
                              />

                              <figcaption>
                                Automatically selected as a useful revision
                                visual.
                              </figcaption>
                            </figure>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </section>
              )}
            </>
          )}

          {/* ---------------- Cheat Sheet Builder ---------------- */}

          {activeTab === "editor" && (
            <section className="card cheat-sheet-builder study-resource-sheet">
              <header className="study-resource-header builder-header">
                <p className="study-resource-label">
                  Custom Revision Workspace
                </p>

                <h2>Cheat Sheet Builder</h2>

                <p>
                  Create a personalised revision sheet by adding and arranging
                  concepts, flashcards and lecture visuals.
                </p>
              </header>

              <div className="builder-status-row">
                <span
                  className={
                    layoutDirty
                      ? "builder-status-badge unsaved"
                      : "builder-status-badge saved"
                  }
                >
                  {layoutDirty ? (
                    <>
                      <Icon name="clock" size={13} />
                      Unsaved changes
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={13} />
                      Saved
                    </>
                  )}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={saveNote}
                  disabled={loading !== ""}
                >
                  <Icon name="save" size={14} />
                  {editingSavedNoteId ? "Update note" : "Save note"}
                </button>
              </div>

              <div className="builder-source-panel">
                <div className="builder-source-tabs">
                  <button
                    type="button"
                    className={
                      editorSource === "keypoints"
                        ? "builder-source-tab active"
                        : "builder-source-tab"
                    }
                    onClick={() => setEditorSource("keypoints")}
                  >
                    Key Points
                  </button>

                  <button
                    type="button"
                    className={
                      editorSource === "summary"
                        ? "builder-source-tab active"
                        : "builder-source-tab"
                    }
                    onClick={() => setEditorSource("summary")}
                  >
                    Summary
                  </button>

                  <button
                    type="button"
                    className={
                      editorSource === "flashcards"
                        ? "builder-source-tab active"
                        : "builder-source-tab"
                    }
                    onClick={() => setEditorSource("flashcards")}
                  >
                    Flashcards
                  </button>

                  <button
                    type="button"
                    className={
                      editorSource === "visuals"
                        ? "builder-source-tab active"
                        : "builder-source-tab"
                    }
                    onClick={() => setEditorSource("visuals")}
                  >
                    Visuals
                  </button>

                  <button
                    type="button"
                    className={
                      editorSource === "original"
                        ? "builder-source-tab active"
                        : "builder-source-tab"
                    }
                    onClick={() => setEditorSource("original")}
                  >
                    Original Notes
                  </button>
                </div>

                {editorSource === "keypoints" && (
                  <ResourceSectionPicker
                    content={keyPoints}
                    emptyMessage="Generate key points before adding them."
                    onAdd={addResourceSectionToEditor}
                    onAddAll={() => addAllSectionsToEditor(keyPoints)}
                  />
                )}

                {editorSource === "summary" && (
                  <ResourceSectionPicker
                    content={summary}
                    emptyMessage="Generate a summary before adding it."
                    onAdd={addResourceSectionToEditor}
                    onAddAll={() => addAllSectionsToEditor(summary)}
                  />
                )}

                {editorSource === "original" && (
                  <ResourceSectionPicker
                    content={notes}
                    emptyMessage="No original notes are available."
                    onAdd={addResourceSectionToEditor}
                    onAddAll={() => addAllSectionsToEditor(notes)}
                  />
                )}

                {editorSource === "flashcards" && (
                  <div className="builder-resource-grid">
                    {flashcards.length === 0 ? (
                      <p className="empty-resource-message">
                        Generate flashcards before adding them.
                      </p>
                    ) : (
                      flashcards.map((card, index) => (
                        <article
                          key={`${card.question}-${index}`}
                          className="builder-resource-item"
                        >
                          <p className="builder-resource-label">
                            Flashcard {index + 1}
                          </p>

                          <h4>{card.question}</h4>
                          <p>{card.answer}</p>

                          <button
                            type="button"
                            onClick={() =>
                              addFlashcardToEditor(card, index)
                            }
                          >
                            Add to canvas
                          </button>
                        </article>
                      ))
                    )}
                  </div>
                )}

                {editorSource === "visuals" && (
                  <div className="builder-resource-grid">
                    {selectedPdfPages.length === 0 ? (
                      <p className="empty-resource-message">
                        No lecture visuals are currently available.
                      </p>
                    ) : (
                      selectedPdfPages.map((pageNumber, index) => {
                        const page = pdfPages.find(
                          (item) => item.pageNumber === pageNumber
                        );

                        if (!page) {
                          return null;
                        }

                        return (
                          <article
                            key={page.pageNumber}
                            className="builder-resource-item builder-visual-item"
                          >
                            <p className="builder-resource-label">
                              Page {page.pageNumber}
                            </p>

                            <img
                              className="builder-visual-preview"
                              src={page.imageUrl}
                              alt={`Lecture page ${page.pageNumber}`}
                            />

                            <button
                              type="button"
                              onClick={() =>
                                addVisualToEditor(page, index)
                              }
                            >
                              Add to canvas
                            </button>
                          </article>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <CheatSheetEditor
                ref={editorRef}
                initialPages={cheatSheetLayout}
                onChange={(layout) => {
                  setCheatSheetLayout(layout);
                  setLayoutDirty(true);
                }}
                exportFileName={
                  noteTitle || "stitch-cheat-sheet"
                }
              />
            </section>
          )}

          {/* ---------------- Saved notes ---------------- */}

          {activeTab === "saved" && (
            <>
              {!subject.trim() ? (
                <div className="card">
                  <EmptyState
                    icon="folder"
                    title="Select a subject first"
                    text="Saved notes are organised per subject. Choose or create a subject in the upload workspace, then come back to load its library."
                  >
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate("upload")}
                    >
                      <Icon name="folderPlus" size={16} />
                      Choose a subject
                    </button>
                  </EmptyState>
                </div>
              ) : savedNotes.length === 0 ? (
                <div className="card">
                  <EmptyState
                    icon="folder"
                    title={`No saved notes in ${subject}`}
                    text="Once you save a note, it will appear here with all of its generated study resources."
                  >
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate("upload")}
                    >
                      <Icon name="upload" size={16} />
                      Upload notes
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fetchSavedNote}
                      disabled={loading !== ""}
                    >
                      <Icon name="refresh" size={16} />
                      Refresh
                    </button>
                  </EmptyState>
                </div>
              ) : (
                <>
                  <div className="saved-notes-toolbar">
                    <div className="saved-notes-search">
                      <Icon name="search" size={15} />
                      <input
                        type="search"
                        className="input"
                        placeholder="Search saved notes…"
                        aria-label="Search saved notes"
                        value={savedNoteSearch}
                        onChange={(event) =>
                          setSavedNoteSearch(event.target.value)
                        }
                      />
                    </div>

                    <select
                      className="select"
                      aria-label="Sort saved notes"
                      value={savedNoteSort}
                      onChange={(event) => setSavedNoteSort(event.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="title">Title A–Z</option>
                    </select>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fetchSavedNote}
                      disabled={loading !== ""}
                    >
                      <Icon name="refresh" size={15} />
                      Refresh
                    </button>
                  </div>

                  {filteredSavedNotes.length === 0 ? (
                    <div className="card">
                      <EmptyState
                        icon="search"
                        title="No matches"
                        text="No saved notes match your search."
                      />
                    </div>
                  ) : (
                    <div className="saved-notes-grid">
                      {filteredSavedNotes.map((note, index) => (
                        <button
                          type="button"
                          key={note.id}
                          className={`card note-card ${
                            selectedSavedNote?.id === note.id ? "selected" : ""
                          }`}
                          onClick={() => {
                            setSelectedSavedNote(note);
                            setSavedNoteTab("original");
                            setSavedCurrentCard(0);
                            setSavedShowAnswer(false);
                            setSavedNoteDraft(null);
                          }}
                        >
                          <div className="note-card-top">
                            <span className="note-card-title">
                              {note.title || `Note ${index + 1}`}
                            </span>
                            {formatNoteDate(note.createdAt) && (
                              <span className="note-card-date">
                                <Icon name="clock" size={12} />
                                {formatNoteDate(note.createdAt)}
                              </span>
                            )}
                          </div>

                          {note.originalText && (
                            <span className="note-card-preview">
                              {note.originalText.slice(0, 140)}
                            </span>
                          )}

                          <span className="note-card-badges">
                            {note.keyPoints && (
                              <span className="badge badge-primary">
                                Key points
                              </span>
                            )}
                            {Array.isArray(note.flashcards) &&
                              note.flashcards.length > 0 && (
                                <span className="badge badge-primary">
                                  {note.flashcards.length} cards
                                </span>
                              )}
                            {note.summary && (
                              <span className="badge badge-neutral">
                                Summary
                              </span>
                            )}
                            {Array.isArray(note.lectureVisuals) &&
                              note.lectureVisuals.length > 0 && (
                                <span className="badge badge-neutral">
                                  {note.lectureVisuals.length} visuals
                                </span>
                              )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedSavedNote && (
                    <div className="saved-note-detail">
                      <div className="saved-note-detail-header">
                        <h3>{selectedSavedNote.title || "Untitled Note"}</h3>

                        <div className="saved-note-detail-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() =>
                              openSavedNoteInBuilder(selectedSavedNote)
                            }
                          >
                            <Icon name="layout" size={16} />
                            Open in Builder
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              beginEditingSavedNote(selectedSavedNote)
                            }
                          >
                            <Icon name="edit" size={16} />
                            Edit Content
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => exportNoteAsPDF(selectedSavedNote)}
                          >
                            <Icon name="download" size={16} />
                            Export PDF
                          </button>

                          <button
                            type="button"
                            className="btn btn-danger-outline"
                            onClick={() =>
                              requestDeleteSavedNote(selectedSavedNote)
                            }
                          >
                            <Icon name="trash" size={16} />
                            Delete
                          </button>
                        </div>
                      </div>

                      {savedNoteDraft && (
                        <section className="saved-note-edit-panel">
                          <h3>Edit saved note</h3>

                          <div className="field">
                            <label
                              className="field-label"
                              htmlFor="draft-title"
                            >
                              Title
                            </label>
                            <input
                              id="draft-title"
                              className="input"
                              value={savedNoteDraft.title}
                              onChange={(event) =>
                                setSavedNoteDraft((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="field">
                            <label
                              className="field-label"
                              htmlFor="draft-original"
                            >
                              Original notes
                            </label>
                            <textarea
                              id="draft-original"
                              className="textarea"
                              value={savedNoteDraft.originalText}
                              onChange={(event) =>
                                setSavedNoteDraft((current) => ({
                                  ...current,
                                  originalText: event.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="field">
                            <label
                              className="field-label"
                              htmlFor="draft-keypoints"
                            >
                              Key points
                            </label>
                            <textarea
                              id="draft-keypoints"
                              className="textarea"
                              value={savedNoteDraft.keyPoints}
                              onChange={(event) =>
                                setSavedNoteDraft((current) => ({
                                  ...current,
                                  keyPoints: event.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="field">
                            <label
                              className="field-label"
                              htmlFor="draft-summary"
                            >
                              Summary
                            </label>
                            <textarea
                              id="draft-summary"
                              className="textarea"
                              value={savedNoteDraft.summary}
                              onChange={(event) =>
                                setSavedNoteDraft((current) => ({
                                  ...current,
                                  summary: event.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="saved-note-edit-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={updateSavedNoteContent}
                              disabled={loading !== ""}
                            >
                              <Icon name="check" size={16} />
                              Save Changes
                            </button>

                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setSavedNoteDraft(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </section>
                      )}

                      <div
                        className="resource-tabs"
                        role="tablist"
                        aria-label="Saved note resources"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={savedNoteTab === "original"}
                          className={`resource-tab ${
                            savedNoteTab === "original" ? "active" : ""
                          }`}
                          onClick={() => setSavedNoteTab("original")}
                        >
                          Original Text
                        </button>

                        <button
                          type="button"
                          role="tab"
                          aria-selected={savedNoteTab === "keypoints"}
                          className={`resource-tab ${
                            savedNoteTab === "keypoints" ? "active" : ""
                          }`}
                          onClick={() => setSavedNoteTab("keypoints")}
                        >
                          Key Points
                        </button>

                        <button
                          type="button"
                          role="tab"
                          aria-selected={savedNoteTab === "flashcards"}
                          className={`resource-tab ${
                            savedNoteTab === "flashcards" ? "active" : ""
                          }`}
                          onClick={() => setSavedNoteTab("flashcards")}
                        >
                          Flashcards
                        </button>

                        <button
                          type="button"
                          role="tab"
                          aria-selected={savedNoteTab === "summary"}
                          className={`resource-tab ${
                            savedNoteTab === "summary" ? "active" : ""
                          }`}
                          onClick={() => setSavedNoteTab("summary")}
                        >
                          Summary
                        </button>
                      </div>

                      {savedNoteTab === "original" && (
                        <section className="study-resource-sheet">
                          <header className="study-resource-header">
                            <p className="study-resource-label">
                              Saved Source Material
                            </p>

                            <h2>Original Notes</h2>

                            <p>
                              The original text used to generate this note's
                              study resources.
                            </p>
                          </header>

                          <div className="study-resource-content">
                            {selectedSavedNote.originalText ? (
                              <div className="original-note-content">
                                {selectedSavedNote.originalText}
                              </div>
                            ) : (
                              <p className="empty-resource-message">
                                No original text saved.
                              </p>
                            )}
                          </div>
                        </section>
                      )}

                      {savedNoteTab === "keypoints" && (
                        <section className="study-resource-sheet">
                          <header className="study-resource-header">
                            <p className="study-resource-label">
                              AI Revision Resource
                            </p>
                            <h2>Key Points</h2>
                            <p>
                              The most important concepts extracted from this
                              saved note.
                            </p>
                          </header>

                          <div className="study-resource-content">
                            <MarkdownContent
                              content={selectedSavedNote.keyPoints}
                              emptyMessage="No key points saved."
                            />
                          </div>
                        </section>
                      )}

                      {savedNoteTab === "summary" && (
                        <section className="summary-sheet">
                          <header className="summary-sheet-header">
                            <p className="summary-sheet-label">
                              AI Revision Resource
                            </p>
                            <h2>Summary Sheet</h2>
                            <p>
                              A concise revision guide generated from this saved
                              note.
                            </p>
                          </header>

                          <div className="summary-sheet-content">
                            <MarkdownContent
                              content={selectedSavedNote.summary}
                              emptyMessage="No summary saved."
                            />
                          </div>

                          {Array.isArray(selectedSavedNote.lectureVisuals) &&
                            selectedSavedNote.lectureVisuals.length > 0 && (
                              <section className="lecture-visuals-section">
                                <div className="lecture-visuals-header">
                                  <div>
                                    <p className="summary-sheet-label">
                                      From your uploaded notes
                                    </p>

                                    <h3>Important Lecture Visuals</h3>
                                  </div>

                                  <span className="visual-count">
                                    {selectedSavedNote.lectureVisuals.length}{" "}
                                    selected
                                  </span>
                                </div>

                                <div className="lecture-visuals">
                                  {selectedSavedNote.lectureVisuals.map(
                                    (visual) => (
                                      <figure
                                        key={visual.pageNumber}
                                        className="lecture-page"
                                      >
                                        <div className="lecture-page-heading">
                                          <span>Lecture visual</span>
                                          <strong>
                                            Page {visual.pageNumber}
                                          </strong>
                                        </div>

                                        <img
                                          src={visual.imageUrl}
                                          alt={`Important lecture visual from page ${visual.pageNumber}`}
                                        />

                                        <figcaption>
                                          Automatically selected as a useful
                                          revision visual.
                                        </figcaption>
                                      </figure>
                                    )
                                  )}
                                </div>
                              </section>
                            )}
                        </section>
                      )}

                      {savedNoteTab === "flashcards" && (
                        <section className="study-resource-sheet">
                          <header className="study-resource-header">
                            <p className="study-resource-label">
                              Active Recall Resource
                            </p>
                            <h2>Flashcards</h2>
                            <p>
                              Review one question at a time and reveal the
                              answer when ready.
                            </p>
                          </header>

                          <div className="study-resource-content">
                            {!Array.isArray(selectedSavedNote.flashcards) ||
                            selectedSavedNote.flashcards.length === 0 ? (
                              <p className="empty-resource-message">
                                No flashcards saved.
                              </p>
                            ) : (
                              <div className="flashcard-study">
                                <div className="flashcard-progress-row">
                                  <span>
                                    Card {savedCurrentCard + 1} of{" "}
                                    {selectedSavedNote.flashcards.length}
                                  </span>

                                  <div className="flashcard-progress-track">
                                    <div
                                      className="flashcard-progress-fill"
                                      style={{
                                        width: `${
                                          ((savedCurrentCard + 1) /
                                            selectedSavedNote.flashcards
                                              .length) *
                                          100
                                        }%`,
                                      }}
                                    />
                                  </div>
                                </div>

                                <article className="flashcard-study-card">
                                  <p className="flashcard-section-label">
                                    Question
                                  </p>

                                  <h3 className="flashcard-question">
                                    {
                                      selectedSavedNote.flashcards[
                                        savedCurrentCard
                                      ].question
                                    }
                                  </h3>

                                  {savedShowAnswer ? (
                                    <div className="flashcard-answer-panel">
                                      <p className="flashcard-section-label">
                                        Answer
                                      </p>

                                      <p className="flashcard-answer-text">
                                        {
                                          selectedSavedNote.flashcards[
                                            savedCurrentCard
                                          ].answer
                                        }
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="flashcard-hidden-hint">
                                      Try answering before revealing the
                                      response.
                                    </p>
                                  )}
                                </article>

                                <div className="flashcard-study-controls">
                                  <button
                                    className="study-control-button secondary"
                                    disabled={savedCurrentCard === 0}
                                    onClick={() => {
                                      setSavedCurrentCard((prev) =>
                                        Math.max(prev - 1, 0)
                                      );
                                      setSavedShowAnswer(false);
                                    }}
                                  >
                                    <Icon name="chevronLeft" size={16} />
                                    Previous
                                  </button>

                                  <button
                                    className="study-control-button primary"
                                    onClick={() =>
                                      setSavedShowAnswer((current) => !current)
                                    }
                                  >
                                    {savedShowAnswer
                                      ? "Hide Answer"
                                      : "Show Answer"}
                                  </button>

                                  <button
                                    className="study-control-button secondary"
                                    disabled={
                                      savedCurrentCard ===
                                      selectedSavedNote.flashcards.length - 1
                                    }
                                    onClick={() => {
                                      setSavedCurrentCard((prev) =>
                                        Math.min(
                                          prev + 1,
                                          selectedSavedNote.flashcards.length -
                                            1
                                        )
                                      );
                                      setSavedShowAnswer(false);
                                    }}
                                  >
                                    Next
                                    <Icon name="chevronRight" size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ---------------- Subject summary ---------------- */}

          {activeTab === "subjectsummary" && (
            <>
              {!subject.trim() ? (
                <div className="card">
                  <EmptyState
                    icon="bookOpen"
                    title="Select a subject first"
                    text="The subject summary combines the key points from every saved note in a subject into one consolidated revision sheet."
                  >
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate("upload")}
                    >
                      <Icon name="folderPlus" size={16} />
                      Choose a subject
                    </button>
                  </EmptyState>
                </div>
              ) : (
                <section className="summary-sheet subject-summary-sheet">
                  <header className="summary-sheet-header">
                    <div className="resource-header-row">
                      <div>
                        <p className="summary-sheet-label">
                          Consolidated Revision Resource
                        </p>

                        <h2>{subject} Summary Sheet</h2>
                      </div>

                      <div className="resource-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            copyText(subjectSummary, "Subject summary")
                          }
                          disabled={!subjectSummary.trim()}
                        >
                          <Icon name="copy" size={14} />
                          Copy
                        </button>
                      </div>
                    </div>

                    <p>
                      A combined revision guide generated from the key points of
                      every saved note in this subject.
                    </p>
                  </header>

                  <div className="subject-summary-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={generateSubjectSummary}
                      disabled={loading !== ""}
                    >
                      <Icon name="sparkles" size={16} />
                      {subjectSummary.trim() ? "Regenerate" : "Generate"} Summary
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={saveSubjectSummary}
                      disabled={loading !== "" || !subjectSummary.trim()}
                    >
                      <Icon name="save" size={16} />
                      Save
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={exportSubjectSummaryAsPDF}
                      disabled={!subjectSummary.trim()}
                    >
                      <Icon name="download" size={16} />
                      Export PDF
                    </button>
                  </div>

                  <div
                    className="summary-sheet-content"
                    style={{ marginTop: "20px" }}
                  >
                    {loading.startsWith("Generating subject summary") ? (
                      <ContentSkeleton />
                    ) : subjectSummary ? (
                      <>
                        <MarkdownContent
                          content={subjectSummary}
                          emptyMessage="No subject summary generated yet."
                        />

                        <label className="subject-summary-editor-label">
                          Edit subject summary
                          <textarea
                            className="subject-summary-editor"
                            value={subjectSummary}
                            onChange={(event) =>
                              setSubjectSummary(event.target.value)
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <EmptyState
                        icon="bookOpen"
                        title="No subject summary yet"
                        text={`Save notes with generated key points under ${subject}, then generate a consolidated summary of the whole subject. If nothing has been saved yet, generation will not have any content to work from.`}
                      />
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel || "Delete"}
        onConfirm={() => {
          confirmDialog?.onConfirm?.();
          setConfirmDialog(null);
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}

export default function AppRoot() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
