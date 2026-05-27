import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const [notes, setNotes] = useState("");
  const [flashcards, setFlashcards] = useState("");
  const [keyPoints, setKeyPoints] = useState("");

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type === "text/plain") {
      const text = await file.text();
      setNotes(text);
    } else if (file.type === "application/pdf") {
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
    } else {
      alert("Please upload a .txt or .pdf file only.");
    }
  };

  const extractKeyPoints = async () => {
    const response = await fetch("http://localhost:3000/api/process-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notes }),
    });

    const data = await response.json();
    setKeyPoints(data.keyPoints);
  };

  const generateFlashcards = async () => {
    const response = await fetch("http://localhost:3000/api/flashcards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notes }),
    });

    const data = await response.json();
    setFlashcards(data.flashcards);
  };

  return (
    <div>
      <h1>Orbital Study Tool</h1>

      <h3>Paste Notes</h3>
      <textarea
        placeholder="Paste your notes here..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows="10"
        cols="60"
      />

      <h3>Or Upload a File</h3>
      <input type="file" accept=".txt,.pdf" onChange={handleFileUpload} />

      <br />
      <br />

      <button onClick={extractKeyPoints}>Extract Key Points</button>

      <button onClick={generateFlashcards} style={{ marginLeft: "10px" }}>
        Generate Flashcards
      </button>

      <h3>Key Points</h3>
      <div style={{ whiteSpace: "pre-wrap" }}>{keyPoints}</div>

      <h3>Flashcards</h3>
      <div style={{ whiteSpace: "pre-wrap" }}>{flashcards}</div>
    </div>
  );
}

export default App;