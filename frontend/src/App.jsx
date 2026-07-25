import "./App.css";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import Tesseract from "tesseract.js";
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import jsPDF from "jspdf";
import CheatSheetEditor from "./CheatSheetEditor";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";

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
    return <div>{emptyMessage}</div>;
  }

  return (
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

  const blob = new Blob([svg], {
    type: "image/svg+xml;charset=utf-8",
  });

  return URL.createObjectURL(blob);
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

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
  const [activeTab, setActiveTab] = useState("keypoints");

  const [savedNoteTab, setSavedNoteTab] = useState("original");

  const [cheatSheetLayout, setCheatSheetLayout] = useState(null);
  const editorRef = useRef(null);
  const [editorSource, setEditorSource] = useState("keypoints");
  const [layoutDirty, setLayoutDirty] = useState(false);

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

      const getMillis = (value) => {
        if (!value) return 0;
        if (typeof value.toMillis === "function") return value.toMillis();
        if (typeof value._seconds === "number") return value._seconds * 1000;
        if (typeof value.seconds === "number") return value.seconds * 1000;
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
      };

      const aTime = getMillis(a.createdAt);
      const bTime = getMillis(b.createdAt);
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

  async function logoutUser() {
    await signOut(auth);
    setUser(null);
    setSubjects([]);
    setSubject("");
    setSavedNotes([]);
  }

  const extractKeyPoints = async (inputNotes = notes) => {
    try {
      setLoading("Extracting key concpts...");
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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError("");
    setLoading("");

    if (file.name.endsWith(".txt")) {
      try {
        setLoading("Reading text file...");

        const text = await file.text();
        setNotes(text);
        setActiveTab("keypoints")
        alert("Text file loaded. Please review and edit the text before generating key points.");
      } catch (err) {
        console.error(err);
        setError("Failed to read text file.");
      } finally {
        setLoading("");
      }
    } else if (file.name.endsWith(".pdf")) {
  try {
    setLoading("Extracting text and rendering PDF pages...");

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
        setLoading("Extracting text from image...");

        const result = await Tesseract.recognize(file, "eng");
        const imageText = result.data.text.trim();

        setNotes(imageText);
        setActiveTab("keypoints");
        alert("Image text extracted. Please review and edit it before generating key points.");
      } catch (err) {
        console.error(err);
        setError("Failed to read image file.");
      } finally {
        setLoading("");
      }
    } else {
      setError("Please upload a .txt, .pdf, .png, .jpg, or .jpeg file only.");
    }
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
       alert("Please generate key points first."); 
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
    } catch (error) {
      console.error("Error adding subject:", error);
      setError("Failed to add subject.");
    }
  }

  async function saveNote() {
    setLoading("Saving note...");
    try {
      if (!subject.trim()) {
        alert("Please select or create a subject first.");
        return;
      }

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

      alert(isUpdating ? "Note updated successfully!" : "Note saved successfully!");
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
      alert(error.message || "Failed to save note");
    }
    setLoading("");
  }

  async function fetchSavedNote() {
    try {
      if (!user) {
        alert("Please log in first.");
        return;
      }

      if (!subject.trim()) {
        alert("Please select a subject first.");
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
        alert("Please select a subject.");
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
      alert(error.message || "Failed to generate subject summary.");
    } finally {
      setLoading("");
    }
  }

  async function saveSubjectSummary() {
    setLoading("Saving subject summary...");
    if (!subjectSummary.trim()) {
      alert("Generate or enter a subject summary first.");
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

      alert("Subject summary saved successfully!");
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to save subject summary.");
    } finally {
      setLoading("");
    }
  }

  function exportSubjectSummaryAsPDF() {
    if (!subjectSummary.trim()) {
      alert("There is no subject summary to export.");
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
      alert("Saved note updated successfully!");
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to update saved note.");
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
  } catch (error) {
    console.error("Error deleting note:", error);
    alert("Failed to delete note");
  }}

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

  alert(
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
    alert("There is no content available to add.");
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

  if (!user) {
    return (
      <div style={styles.page}>
        <div style={styles.loginContainer}>
          <div style={styles.loginCard}>
            <h1 style={styles.loginTitle}>Login to Stitch.io</h1>

            <p style={styles.loginSubtitle}>
              Access your saved notes, flashcards and summaries
            </p>

            <input
              style={styles.input}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button style={styles.loginButton} onClick={loginUser}>
              Login
            </button>

            <button style={styles.registerButton} onClick={registerUser}>
              Register
            </button>

            {error && <p style={styles.error}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Stitch.io</h1>

        <p style={styles.subtitle}>
          Upload or paste your study materials to generate key points,
          flashcards, and summary sheets.
        </p>

        <div style={styles.card}>
          <h2 style={styles.heading}>Subjects</h2>

          <input
            style={styles.input}
            placeholder="Create new subject"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
          />

          <button style={styles.button} onClick={addSubject}>
            Add Subject
          </button>

          <select
            style={styles.input}
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

          <p>Current subject: {subject || "None selected"}</p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.heading}>Input Notes</h2>

          <input
  style={styles.input}
  placeholder="Enter note title"
  value={noteTitle}
  onChange={(e) => setNoteTitle(e.target.value)}
/>
        <p style={styles.helperText}>
          Review and edit your notes here before generating study materials.
          For OCR image uploads, clean up any inaccurate text before continuing.
        </p>

        <textarea
          style={styles.textarea}
          placeholder="Paste your notes here..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

          <div style={styles.uploadBox}>
            <p style={styles.uploadText}>
              Or upload a .txt / .pdf / .png / .jpg file
            </p>

            <input
              type="file"
              accept=".txt,.pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
            />
          </div>

          <p style={styles.helperText}>
            Uploaded files will automatically generate key points. Use the key
            points button only for notes typed or pasted manually.
          </p>

          <div style={styles.actionSection}>
            <p style={styles.actionLabel}>Generate</p>

            <div style={styles.buttonRow}>
              <button
                style={styles.button}
                onClick={() => extractKeyPoints()}
                disabled={loading !== ""}
              >
                Key Points
              </button>

              <button
                style={styles.button}
                onClick={generateFlashcards}
                disabled={loading !== ""}
              >
                Flashcards
              </button>

              <button
                style={styles.button}
                onClick={generateSummary}
                disabled={loading !== ""}
              >
                Summary Sheet
              </button>
            </div>

            <p style={styles.actionLabel}>Storage</p>

            <div style={styles.buttonRow}>
              <button
                style={styles.secondaryButton}
                onClick={saveNote}
                disabled={loading !== ""}
              >
                {editingSavedNoteId ? "Update Note" : "Save Note"}
              </button>

              <button
                style={styles.secondaryButton}
                onClick={fetchSavedNote}
                disabled={loading !== ""}
              >
                View Saved Notes
              </button>
            </div>

            <p style={styles.actionLabel}>Account</p>

            <div style={styles.buttonRow}>
              <button
                style={styles.logoutButton}
                onClick={logoutUser}
                disabled={loading !== ""}
              >
                Logout
              </button>
            </div>
          </div>

          {loading && <p style={styles.loading}>{loading}</p>}
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.card}>
          <div style={styles.tabRow}>
            <button
              style={
                activeTab === "keypoints" ? styles.activeTab : styles.tabButton
              }
              onClick={() => setActiveTab("keypoints")}
            >
              Key Points
            </button>

            <button
              style={
                activeTab === "flashcards" ? styles.activeTab : styles.tabButton
              }
              onClick={() => setActiveTab("flashcards")}
            >
              Flashcards
            </button>

            <button
              style={activeTab === "summary" ? styles.activeTab : styles.tabButton}
              onClick={() => setActiveTab("summary")}
            >
              Summary Sheet
            </button>

            <button
              style={
                activeTab === "editor" 
                  ? styles.activeTab 
                  : styles.tabButton
                }
                onClick={openCheatSheetBuilder}
            >
              Cheat Sheet Builder
            </button>

            <button
              style={activeTab === "saved" ? styles.activeTab : styles.tabButton}
              onClick={() => setActiveTab("saved")}
            >
              Saved Notes
            </button>
          </div>

          {activeTab === "editor" && (
            <section className="cheat-sheet-builder study-resource-sheet">
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
      {layoutDirty ? "● Unsaved changes" : "✓ Saved"}
    </span>
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

          {activeTab === "keypoints" && (
  <section className="study-resource-sheet">
    <header className="study-resource-header">
      <p className="study-resource-label">AI Revision Resource</p>
      <h2>Key Points</h2>
      <p>
        The most important concepts extracted from your uploaded notes.
      </p>
    </header>

    <div className="study-resource-content">
      {keyPoints ? (
        <MarkdownContent content={keyPoints} />
      ) : (
        <p className="empty-resource-message">
          No key points generated yet.
        </p>
      )}
    </div>
  </section>
)}

          {activeTab === "flashcards" && (
  <section className="study-resource-sheet">
    <header className="study-resource-header">
      <p className="study-resource-label">Active Recall Resource</p>
      <h2>Flashcards</h2>
      <p>
        Review one question at a time and reveal the answer when ready.
      </p>
    </header>

    <div className="study-resource-content">
      {flashcards.length === 0 ? (
        <p className="empty-resource-message">
          No flashcards generated yet.
        </p>
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
      <p className="summary-sheet-label">AI Revision Resource</p>
      <h2>Summary Sheet</h2>
      <p>
        A concise revision guide generated from your extracted key points.
      </p>
    </header>

    <div className="summary-sheet-content">
      <MarkdownContent
        content={summary}
        emptyMessage="No summary sheet generated yet."
      />
    </div>

    {selectedPdfPages.length > 0 && (
      <section className="lecture-visuals-section">
        <div className="lecture-visuals-header">
          <div>
            <p className="summary-sheet-label">From your uploaded notes</p>
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
                  Automatically selected as a useful revision visual.
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>
    )}
  </section>
)}

          {activeTab === "saved" && (
  <>
    <h2 style={styles.heading}>Saved Notes</h2>

    {savedNotes.length === 0 ? (
      <div style={styles.output}>No saved notes loaded yet.</div>
    ) : (
      <>
        <div className="saved-notes-toolbar">
          <input
            type="search"
            placeholder="Search saved notes..."
            value={savedNoteSearch}
            onChange={(event) => setSavedNoteSearch(event.target.value)}
          />

          <select
            value={savedNoteSort}
            onChange={(event) => setSavedNoteSort(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>

        {filteredSavedNotes.length === 0 && (
          <p className="empty-resource-message">
            No saved notes match your search.
          </p>
        )}

        <div style={styles.savedNotesTabs}>
          {filteredSavedNotes.map((note, index) => (
            <button
              key={note.id}
              style={
                selectedSavedNote?.id === note.id
                  ? styles.activeNoteTab
                  : styles.noteTab
              }
              onClick={() => {
  setSelectedSavedNote(note);
  setSavedNoteTab("original");
  setSavedCurrentCard(0);
  setSavedShowAnswer(false);
  setSavedNoteDraft(null);
}}
            >
              {note.title || `Note ${index + 1}`}
            </button>
          ))}
        </div>

        <div className="subject-summary-actions">
          <button
            style={styles.button}
            onClick={generateSubjectSummary}
            disabled={loading}
          >
            Generate Subject Summary
          </button>

          <button
            style={styles.secondaryButton}
            onClick={saveSubjectSummary}
            disabled={loading || !subjectSummary.trim()}
          >
            Save Subject Summary
          </button>

          <button
            style={styles.secondaryButton}
            onClick={exportSubjectSummaryAsPDF}
            disabled={!subjectSummary.trim()}
          >
            Export Subject Summary
          </button>
        </div>

        {subjectSummary && (
  <section className="summary-sheet subject-summary-sheet">
    <header className="summary-sheet-header">
      <p className="summary-sheet-label">
        Consolidated Revision Resource
      </p>

      <h2>{subject || "Subject"} Summary Sheet</h2>

      <p>
        A combined revision guide generated from all saved notes in this
        subject.
      </p>
    </header>

    <div className="summary-sheet-content">
      <MarkdownContent
        content={subjectSummary}
        emptyMessage="No subject summary generated yet."
      />

      <label className="subject-summary-editor-label">
        Edit subject summary
        <textarea
          className="subject-summary-editor"
          value={subjectSummary}
          onChange={(event) => setSubjectSummary(event.target.value)}
        />
      </label>
    </div>
  </section>
)}

        {selectedSavedNote && (
          <div style={styles.savedNoteCard}>
            <div style={styles.savedNoteHeader}>
              <h3>{selectedSavedNote.title || "Untitled Note"}</h3>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={styles.button}
                  onClick={() => openSavedNoteInBuilder(selectedSavedNote)}
                >
                  Open in Builder
                </button>

                <button
                  style={styles.secondaryButton}
                  onClick={() => beginEditingSavedNote(selectedSavedNote)}
                >
                  Edit Content
                </button>

                <button
                  style={styles.secondaryButton}
                  onClick={() => exportNoteAsPDF(selectedSavedNote)}
                >
                  Export Note
                </button>
              <button
                style={styles.deleteButton}
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to permanently delete this note?"
                    )
                  ) {
                    deleteSavedNote(selectedSavedNote.id);
                  }
                }}
              >
                Delete Note
              </button>
            </div>
          </div>

            {savedNoteDraft && (
              <section className="saved-note-edit-panel">
                <h3>Edit saved note</h3>

                <label>
                  Title
                  <input
                    value={savedNoteDraft.title}
                    onChange={(event) =>
                      setSavedNoteDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Original notes
                  <textarea
                    value={savedNoteDraft.originalText}
                    onChange={(event) =>
                      setSavedNoteDraft((current) => ({
                        ...current,
                        originalText: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Key points
                  <textarea
                    value={savedNoteDraft.keyPoints}
                    onChange={(event) =>
                      setSavedNoteDraft((current) => ({
                        ...current,
                        keyPoints: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Summary
                  <textarea
                    value={savedNoteDraft.summary}
                    onChange={(event) =>
                      setSavedNoteDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="saved-note-edit-actions">
                  <button
                    style={styles.button}
                    onClick={updateSavedNoteContent}
                    disabled={loading}
                  >
                    Save Changes
                  </button>

                  <button
                    style={styles.secondaryButton}
                    onClick={() => setSavedNoteDraft(null)}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            <div style={styles.tabRow}>
              <button
                style={savedNoteTab === "original" ? styles.activeTab : styles.tabButton}
                onClick={() => setSavedNoteTab("original")}
              >
                Original Text
              </button>

              <button
                style={savedNoteTab === "keypoints" ? styles.activeTab : styles.tabButton}
                onClick={() => setSavedNoteTab("keypoints")}
              >
                Key Points
              </button>

              <button
                style={savedNoteTab === "flashcards" ? styles.activeTab : styles.tabButton}
                onClick={() => setSavedNoteTab("flashcards")}
              >
                Flashcards
              </button>

              <button
                style={savedNoteTab === "summary" ? styles.activeTab : styles.tabButton}
                onClick={() => setSavedNoteTab("summary")}
              >
                Summary
              </button>
            </div>

            {savedNoteTab === "original" && (
  <section className="study-resource-sheet">
    <header className="study-resource-header">
      <p className="study-resource-label">Saved Source Material</p>

      <h2>Original Notes</h2>

      <p>
        The original text used to generate this note’s study resources.
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
      <p className="study-resource-label">AI Revision Resource</p>
      <h2>Key Points</h2>
      <p>
        The most important concepts extracted from this saved note.
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
      <p className="summary-sheet-label">AI Revision Resource</p>
      <h2>Summary Sheet</h2>
      <p>
        A concise revision guide generated from this saved note.
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
              {selectedSavedNote.lectureVisuals.length} selected
            </span>
          </div>

          <div className="lecture-visuals">
            {selectedSavedNote.lectureVisuals.map((visual) => (
              <figure
                key={visual.pageNumber}
                className="lecture-page"
              >
                <div className="lecture-page-heading">
                  <span>Lecture visual</span>
                  <strong>Page {visual.pageNumber}</strong>
                </div>

                <img
                  src={visual.imageUrl}
                  alt={`Important lecture visual from page ${visual.pageNumber}`}
                />

                <figcaption>
                  Automatically selected as a useful revision visual.
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
  </section>
)}

            {savedNoteTab === "flashcards" && (
  <section className="study-resource-sheet">
    <header className="study-resource-header">
      <p className="study-resource-label">Active Recall Resource</p>
      <h2>Flashcards</h2>
      <p>
        Review one question at a time and reveal the answer when ready.
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
                      selectedSavedNote.flashcards.length) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>

          <article className="flashcard-study-card">
            <p className="flashcard-section-label">Question</p>

            <h3 className="flashcard-question">
              {selectedSavedNote.flashcards[savedCurrentCard].question}
            </h3>

            {savedShowAnswer ? (
              <div className="flashcard-answer-panel">
                <p className="flashcard-section-label">Answer</p>

                <p className="flashcard-answer-text">
                  {
                    selectedSavedNote.flashcards[savedCurrentCard]
                      .answer
                  }
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
              disabled={savedCurrentCard === 0}
              onClick={() => {
                setSavedCurrentCard((prev) =>
                  Math.max(prev - 1, 0)
                );
                setSavedShowAnswer(false);
              }}
            >
              Previous
            </button>

            <button
              className="study-control-button primary"
              onClick={() =>
                setSavedShowAnswer((current) => !current)
              }
            >
              {savedShowAnswer ? "Hide Answer" : "Show Answer"}
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
                    selectedSavedNote.flashcards.length - 1
                  )
                );
                setSavedShowAnswer(false);
              }}
            >
              Next
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
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #e0f2fe 100%)",
    padding: "40px",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
  },

  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },

  loginContainer: {
    minHeight: "calc(100vh - 80px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  loginCard: {
    width: "100%",
    maxWidth: "430px",
    backgroundColor: "white",
    color: "#111827",
    padding: "36px",
    borderRadius: "20px",
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.12)",
    border: "1px solid #e5e7eb",
  },

  loginTitle: {
    textAlign: "center",
    fontSize: "34px",
    marginBottom: "8px",
    color: "#111827",
    fontWeight: "800",
  },

  loginSubtitle: {
    textAlign: "center",
    fontSize: "15px",
    color: "#6b7280",
    marginBottom: "28px",
  },

  loginButton: {
    width: "100%",
    padding: "13px 20px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#2563eb",
    color: "white",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "8px",
  },

  registerButton: {
    width: "100%",
    padding: "13px 20px",
    border: "1px solid #2563eb",
    borderRadius: "10px",
    backgroundColor: "white",
    color: "#2563eb",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "12px",
  },

  title: {
    textAlign: "center",
    fontSize: "48px",
    marginBottom: "10px",
    color: "#111827",
    fontWeight: "bold",
  },

  subtitle: {
    textAlign: "center",
    color: "#4b5563",
    fontSize: "18px",
    marginBottom: "30px",
  },

  card: {
    backgroundColor: "white",
    color: "#111827",
    padding: "28px",
    borderRadius: "14px",
    marginBottom: "24px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },

  heading: {
    marginBottom: "16px",
    color: "#111827",
    textAlign: "center",
  },

  textarea: {
    width: "100%",
    height: "220px",
    padding: "14px",
    fontSize: "15px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    resize: "vertical",
    backgroundColor: "white",
    color: "#111827",
    boxSizing: "border-box",
  },

  richEditorBox: {
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    padding: "18px",
    minHeight: "300px",
    backgroundColor: "white",
    color: "#111827",
    lineHeight: "1.7",
  },

  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "15px",
    boxSizing: "border-box",
    backgroundColor: "white",
    color: "#111827",
  },

  uploadBox: {
    marginTop: "20px",
    padding: "16px",
    backgroundColor: "#f9fafb",
    color: "#374151",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
    textAlign: "center",
  },

  uploadText: {
    marginBottom: "10px",
    fontWeight: "500",
  },

  helperText: {
    marginTop: "16px",
    color: "#6b7280",
    fontSize: "14px",
    textAlign: "center",
  },

  actionSection: {
    marginTop: "24px",
  },

  actionLabel: {
    marginTop: "18px",
    marginBottom: "8px",
    color: "#6b7280",
    fontSize: "14px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },

  buttonRow: {
    marginTop: "10px",
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },

  button: {
    padding: "12px 20px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "white",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },

  secondaryButton: {
    padding: "12px 20px",
    border: "1px solid #2563eb",
    borderRadius: "8px",
    backgroundColor: "white",
    color: "#2563eb",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },

  logoutButton: {
    padding: "12px 20px",
    border: "1px solid #dc2626",
    borderRadius: "8px",
    backgroundColor: "white",
    color: "#dc2626",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },

  tabRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "24px",
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: "12px",
    flexWrap: "wrap",
  },

  tabButton: {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    backgroundColor: "white",
    color: "#374151",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },

  activeTab: {
    padding: "10px 16px",
    border: "1px solid #2563eb",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "white",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },

  flashcardControls: {
    marginTop: "22px",
    display: "flex",
    justifyContent: "center",
    gap: "12px",
    flexWrap: "wrap",
  },

  primaryStudyButton: {
    padding: "12px 28px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "white",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
  },

  loading: {
    marginTop: "18px",
    color: "#2563eb",
    fontWeight: "bold",
  },

  error: {
    marginTop: "18px",
    color: "#dc2626",
    fontWeight: "bold",
  },

  output: {
    whiteSpace: "pre-wrap",
    lineHeight: "1.8",
    color: "#374151",
    fontSize: "15px",
  },

  savedNotesTabs: {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "20px",
},

noteTab: {
  padding: "10px 16px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  backgroundColor: "white",
  color: "#374151",
  cursor: "pointer",
  fontWeight: "600",
},

activeNoteTab: {
  padding: "10px 16px",
  border: "1px solid #2563eb",
  borderRadius: "8px",
  backgroundColor: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontWeight: "700",
},

savedNoteHeader: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
  gap: "16px",
},

deleteButton: {
  padding: "10px 16px",
  border: "none",
  borderRadius: "8px",
  backgroundColor: "#dc2626",
  color: "white",
  cursor: "pointer",
  fontWeight: "600",
},
  
  savedNoteCard: {
    borderTop: "1px solid #e5e7eb",
    paddingTop: "16px",
    marginTop: "16px",
  },

  savedFlashcard: {
    borderTop: "1px solid #e5e7eb",
    paddingTop: "10px",
    marginTop: "10px",
  },

  flashcardBox: {
    marginTop: "16px",
  },

  cardCounter: {
    textAlign: "center",
    color: "#6b7280",
    marginBottom: "12px",
  },

  flashcard: {
    backgroundColor: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "32px",
    minHeight: "250px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    textAlign: "center",
  },

  flashcardLabel: {
    color: "#2563eb",
    marginBottom: "10px",
  },

  flashcardText: {
    fontSize: "22px",
    fontWeight: "600",
    color: "#111827",
    lineHeight: "1.5",
  },

  flashcardAnswer: {
    fontSize: "18px",
    color: "#374151",
    lineHeight: "1.6",
    marginTop: "10px",
  },
};

export default App;