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

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [notes, setNotes] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [summary, setSummary] = useState("");

  const [flashcards, setFlashcards] = useState([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const [savedNotes, setSavedNotes] = useState([]);
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState("");

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError("");
    setLoading("");

    if (file.name.endsWith(".txt")) {
      const text = await file.text();
      setNotes(text);
    } else if (file.name.endsWith(".pdf")) {
      try {
        setLoading("Extracting text from PDF...");

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let pdfText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          const pageText = textContent.items
            .map((item) => item.str)
            .join(" ");

          pdfText += pageText + "\n\n";
        }

        setNotes(pdfText);
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
        setNotes(result.data.text.trim());
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

  const extractKeyPoints = async () => {
    try {
      setLoading("Processing notes...");
      setError("");

      const response = await fetch("http://localhost:3000/api/process-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();
      setKeyPoints(data.keyPoints);
    } catch (err) {
      console.error(err);
      setError("Failed to extract key points.");
    } finally {
      setLoading("");
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
    } catch (err) {
      console.error(err);
      setError("Failed to generate flashcards.");
    } finally {
      setLoading("");
    }
  };

  const generateSummary = async () => {
    try {
      setLoading("Generating summary sheet...");
      setError("");

      const response = await fetch("http://localhost:3000/api/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();
      setSummary(data.summary);
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
          title: "Untitled Note",
          originalText: notes,
          keyPoints,
          flashcards,
          sourceType: "text",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save note");
      }

      console.log("Saved:", data);
      alert("Note saved successfully!");
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
      } else {
        setSavedNotes([]);
      }
    } catch (error) {
      console.error("Error fetching saved notes:", error);
      setError("Failed to fetch saved notes.");
    } finally {
      setLoading("");
    }
  }

  if (!user) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.card}>
            <h1>Login to Stitch.io</h1>

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

            <div style={styles.buttonRow}>
              <button style={styles.button} onClick={loginUser}>
                Login
              </button>

              <button style={styles.button} onClick={registerUser}>
                Register
              </button>
            </div>

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

          <div style={styles.buttonRow}>
            <button
              style={styles.button}
              onClick={extractKeyPoints}
              disabled={loading}
            >
              Extract Key Points
            </button>

            <button
              style={styles.button}
              onClick={generateFlashcards}
              disabled={loading}
            >
              Generate Flashcards
            </button>

            <button
              style={styles.button}
              onClick={generateSummary}
              disabled={loading}
            >
              Generate Summary Sheet
            </button>

            <button style={styles.button} onClick={saveNote} disabled={loading}>
              Save Notes
            </button>

            <button
              style={styles.button}
              onClick={fetchSavedNote}
              disabled={loading}
            >
              View Saved Notes
            </button>

            <button style={styles.button} onClick={logoutUser} disabled={loading}>
              Logout
            </button>
          </div>

          {loading && <p style={styles.loading}>{loading}</p>}
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.card}>
          <h2 style={styles.heading}>Key Points</h2>
          <div style={styles.output}>
            {keyPoints || "No key points generated yet."}
          </div>
        </div>

        <div style={styles.card}>
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

              <div style={styles.buttonRow}>
                <button
                  style={styles.button}
                  onClick={() => setShowAnswer(!showAnswer)}
                >
                  {showAnswer ? "Hide Answer" : "Show Answer"}
                </button>

                <button
                  style={styles.button}
                  disabled={currentCard === 0}
                  onClick={() => {
                    setCurrentCard((prev) => Math.max(prev - 1, 0));
                    setShowAnswer(false);
                  }}
                >
                  Previous
                </button>

                <button
                  style={styles.button}
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

        <div style={styles.card}>
          <h2 style={styles.heading}>Summary Sheet</h2>
          <div style={styles.output}>
            {summary || "No summary sheet generated yet."}
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.heading}>Saved Notes</h2>

          {savedNotes.length === 0 ? (
            <div style={styles.output}>No saved notes loaded yet.</div>
          ) : (
            savedNotes.map((item) => (
              <div key={item.id} style={styles.savedNoteCard}>
                <h3>{item.title || "Untitled Note"}</h3>

                <p>
                  <strong>Original Text:</strong>
                </p>
                <div style={styles.output}>
                  {item.originalText || "No original text saved."}
                </div>

                <p>
                  <strong>Key Points:</strong>
                </p>
                <div style={styles.output}>
                  {item.keyPoints || "No key points saved."}
                </div>

                <p>
                  <strong>Flashcards:</strong>
                </p>
                <div style={styles.output}>
                  {Array.isArray(item.flashcards) &&
                  item.flashcards.length > 0
                    ? item.flashcards.map((card, index) => (
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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f3f4f6",
    padding: "40px",
    fontFamily: "Arial, sans-serif",
  },

  container: {
    maxWidth: "900px",
    margin: "0 auto",
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
  },

  uploadBox: {
    marginTop: "20px",
    padding: "16px",
    backgroundColor: "#f9fafb",
    color: "#374151",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },

  uploadText: {
    marginBottom: "10px",
    fontWeight: "500",
  },

  buttonRow: {
    marginTop: "20px",
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

  loading: {
    marginTop: "18px",
    color: "#2563eb",
    fontWeight: "bold",
  },

  error: {
    marginTop: "18px",
    color: "red",
    fontWeight: "bold",
  },

  output: {
    whiteSpace: "pre-wrap",
    lineHeight: "1.8",
    color: "#374151",
    fontSize: "15px",
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