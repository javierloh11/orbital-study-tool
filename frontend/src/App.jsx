import { useState } from "react";
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

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [notes, setNotes] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [summary, setSummary] = useState("");
  const [subjectSummary, setSubjectSummary] = useState("");
  const [noteTitle, setNoteTitle] = useState("");

  const [flashcards, setFlashcards] = useState([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const [savedNotes, setSavedNotes] = useState([]);
  const [selectedSavedNote, setSelectedSavedNote] = useState(null);
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState("");

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("keypoints");

  const [savedNoteTab, setSavedNoteTab] = useState("original");

  async function fetchSubjects(currentUser = user) {
    try {
      if (!currentUser) return;

      const token = await currentUser.getIdToken();

      const response = await fetch("http://localhost:3000/subjects", {
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
      setLoading("Processing notes...");
      setError("");

      const response = await fetch("http://localhost:3000/api/process-notes", {
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
        await extractKeyPoints(text);
      } catch (err) {
        console.error(err);
        setError("Failed to read text file.");
      } finally {
        setLoading("");
      }
    } else if (file.name.endsWith(".pdf")) {
      try {
        setLoading("Extracting text from PDF...");

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let pdfText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          const pageText = textContent.items.map((item) => item.str).join(" ");

          pdfText += pageText + "\n\n";
        }

        setNotes(pdfText);
        await extractKeyPoints(pdfText);
      } catch (err) {
        console.error(err);
        setError("Failed to read PDF file.");
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
        await extractKeyPoints(imageText);
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

  const generateFlashcards = async () => {
    try {
      setLoading("Generating flashcards...");
      setError("");

      const response = await fetch("http://localhost:3000/api/flashcards", {
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
      setLoading("Generating summary sheet...");
      setError("");

      const response = await fetch("http://localhost:3000/api/summary", {
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

      await fetch("http://localhost:3000/subjects", {
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
    try {
      if (!subject.trim()) {
        alert("Please select or create a subject first.");
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch("http://localhost:3000/save-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject,
          title: noteTitle.trim() || "Untitled Note",
          originalText: notes,
          keyPoints,
          flashcards,
          summary,
          sourceType: "text",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save note");
      }

      console.log("Saved:", data);
      alert("Note saved successfully!");
      setNoteTitle("");
      await fetchSubjects(user);
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Failed to save note");
    }
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
        `http://localhost:3000/saved-notes/${subject}`,
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

  if (data.length > 0) {
    setSelectedSavedNote(data[0]);
  } else {
    setSelectedSavedNote(null);
  }

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
  
  async function generateSubjectSummary() {
    try {
      if (!subject) {
        alert("Please select a subject.");
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch(
        `http://localhost:3000/subject-summary/${subject}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      setSubjectSummary(data.summary);
    } catch (error) {
      console.error(error);
      alert("Failed to generate subject summary.");
    }
  }


  async function deleteSavedNote(noteId) {
  try {
    const token = await user.getIdToken();

    await fetch(
      `http://localhost:3000/saved-notes/${subject}/${noteId}`,
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
                disabled={loading}
              >
                Key Points
              </button>

              <button
                style={styles.button}
                onClick={generateFlashcards}
                disabled={loading}
              >
                Flashcards
              </button>

              <button
                style={styles.button}
                onClick={generateSummary}
                disabled={loading}
              >
                Summary Sheet
              </button>
            </div>

            <p style={styles.actionLabel}>Storage</p>

            <div style={styles.buttonRow}>
              <button
                style={styles.secondaryButton}
                onClick={saveNote}
                disabled={loading}
              >
                Save Notes
              </button>

              <button
                style={styles.secondaryButton}
                onClick={fetchSavedNote}
                disabled={loading}
              >
                View Saved Notes
              </button>
            </div>

            <p style={styles.actionLabel}>Account</p>

            <div style={styles.buttonRow}>
              <button
                style={styles.logoutButton}
                onClick={logoutUser}
                disabled={loading}
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
              style={activeTab === "saved" ? styles.activeTab : styles.tabButton}
              onClick={() => setActiveTab("saved")}
            >
              Saved Notes
            </button>
          </div>

          {activeTab === "keypoints" && (
            <>
              <h2 style={styles.heading}>Key Points</h2>
              <div style={styles.output}>
                {keyPoints || "No key points generated yet."}
              </div>
            </>
          )}

          {activeTab === "flashcards" && (
            <>
              <h2 style={styles.heading}>Flashcards</h2>

              {flashcards.length === 0 ? (
                <div style={styles.output}>No flashcards generated yet.</div>
              ) : (
                <div style={styles.flashcardBox}>
                  <p style={styles.cardCounter}>
                    Card {currentCard + 1} of {flashcards.length}
                  </p>

                  <div style={styles.flashcard}>
                    <h3 style={styles.flashcardLabel}>Question</h3>

                    <p style={styles.flashcardText}>
                      {flashcards[currentCard].question}
                    </p>

                    {showAnswer && (
                      <>
                        <h3 style={styles.flashcardLabel}>Answer</h3>

                        <p style={styles.flashcardAnswer}>
                          {flashcards[currentCard].answer}
                        </p>
                      </>
                    )}
                  </div>

                  <div style={styles.flashcardControls}>
                    <button
                      style={styles.secondaryButton}
                      disabled={currentCard === 0}
                      onClick={() => {
                        setCurrentCard((prev) => Math.max(prev - 1, 0));
                        setShowAnswer(false);
                      }}
                    >
                      Previous
                    </button>

                    <button
                      style={styles.primaryStudyButton}
                      onClick={() => setShowAnswer(!showAnswer)}
                    >
                      {showAnswer ? "Hide Answer" : "Show Answer"}
                    </button>

                    <button
                      style={styles.secondaryButton}
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
            </>
          )}

          {activeTab === "summary" && (
            <>
              <h2 style={styles.heading}>Summary Sheet</h2>
              <div style={styles.output}>
                {summary || "No summary sheet generated yet."}
              </div>
            </>
          )}

          {activeTab === "saved" && (
  <>
    <h2 style={styles.heading}>Saved Notes</h2>

    {savedNotes.length === 0 ? (
      <div style={styles.output}>No saved notes loaded yet.</div>
    ) : (
      <>
        <div style={styles.savedNotesTabs}>
          {savedNotes.map((note, index) => (
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
              }}
            >
              {note.title || `Note ${index + 1}`}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: "20px" }}>
          <button
            style={styles.button}
            onClick={generateSubjectSummary}
          >
            Generate Subject Summary Sheet
          </button>
        </div>

        {subjectSummary && (
          <div style={styles.savedNoteCard}>
            <h3>{subject} Cheat Sheet</h3>

            <div style={styles.output}>
              {subjectSummary}
            </div>
          </div>
        )}

        {selectedSavedNote && (
          <div style={styles.savedNoteCard}>
            <div style={styles.savedNoteHeader}>
              <h3>{selectedSavedNote.title || "Untitled Note"}</h3>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={styles.secondaryButton}
                  onClick={() => exportNoteAsPDF(selectedSavedNote)}
                >
                  Export Note
                </button>
              <button
                style={styles.deleteButton}
                onClick={() => deleteSavedNote(selectedSavedNote.id)}
              >
                Delete Note
              </button>
            </div>
          </div>

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
              <div style={styles.output}>
                {selectedSavedNote.originalText || "No original text saved."}
              </div>
            )}

            {savedNoteTab === "keypoints" && (
              <div style={styles.output}>
                {selectedSavedNote.keyPoints || "No key points saved."}
              </div>
            )}

            {savedNoteTab === "summary" && (
              <div style={styles.output}>
                {selectedSavedNote.summary || "No summary saved."}
              </div>
            )}

            {savedNoteTab === "flashcards" && (
              <div style={styles.output}>
                {Array.isArray(selectedSavedNote.flashcards) &&
                selectedSavedNote.flashcards.length > 0
                  ? selectedSavedNote.flashcards.map((card, index) => (
                    <div key={index} style={styles.savedFlashcard}>
                      <p>
                        <strong>Q:</strong> {card.question}
                      </p>
                      <p>
                        <strong>A:</strong> {card.answer}
                      </p>
                    </div>
                  ))
                : "No flashcards saved."}
            </div>
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
    maxWidth: "900px",
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