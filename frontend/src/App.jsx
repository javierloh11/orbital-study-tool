import { useState } from "react";

function App() {
  const [notes, setNotes] = useState("");
  const [flashcards, setFlashcards] = useState([]);

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

      <textarea
        placeholder="Paste your notes here..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <br />

      <button onClick={generateFlashcards}>
        Generate Flashcards
      </button>

      <div>
        {flashcards.map((card, index) => (
          <div key={index}>
            <h3>{card.question}</h3>
            <p>{card.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;