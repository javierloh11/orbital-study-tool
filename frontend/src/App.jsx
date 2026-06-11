import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import Tesseract from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const [notes, setNotes] = useState("");
  const [flashcards, setFlashcards] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

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

        const pdf = await pdfjsLib.getDocument({
          data: arrayBuffer,
        }).promise;

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

        const result = await Tesseract.recognize(
          file,
          "eng"
        );

        const extractedText = result.data.text.trim();

        setNotes(extractedText);

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

      const response = await fetch(
        "http://localhost:3000/api/process-notes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes }),
        }
      );

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

      const response = await fetch(
        "http://localhost:3000/api/flashcards",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes }),
        }
      );

      const data = await response.json();

      setFlashcards(data.flashcards);

    } catch (err) {
      console.error(err);
      setError("Failed to generate flashcards.");

    } finally {
      setLoading("");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <h1 style={styles.title}>
          Stitch.io
        </h1>

        <p style={styles.subtitle}>
          Upload or paste your study materials to generate key points and flashcards.
        </p>

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
            onClick={saveNote}
            disabled={loading}
            >
              Save Notes
            </button>
          </div>

          {loading && (
            <p style={styles.loading}>
              {loading}
            </p>
          )}

          {error && (
            <p style={styles.error}>
              {error}
            </p>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.heading}>Key Points</h2>

          <div style={styles.output}>
            {keyPoints || "No key points generated yet."}
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.heading}>Flashcards</h2>

          <div style={styles.output}>
            {flashcards || "No flashcards generated yet."}
          </div>
        </div>

      </div>
    </div>
    
  );
  async function saveNote() {
  try {
    const response = await fetch("http://localhost:3000/save-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Untitled Note",
        originalText: notes,
        keyPoints: keyPoints,
        flashcards: flashcards,
        sourceType: "text"
      })
    });

    const data = await response.json();

    console.log("Saved:", data);
    alert("Note saved successfully!");

  } catch (error) {
    console.error("Error saving note:", error);
    alert("Failed to save note");
  }
}
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
};

export default App;