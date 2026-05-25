import { useState } from "react";

function App() {
  const [message, setMessage] = useState("");

  const testBackend = async () => {
    const response = await fetch("http://localhost:3000/api/test");
    const data = await response.json();

    setMessage(data.message);
  };

  return (
    <div>
      <h1>Orbital Study Tool</h1>

      <textarea placeholder="Paste your notes here..." />
      <br />

      <button onClick={testBackend}>
        Generate Flashcards
      </button>

      <p>{message}</p>
    </div>
  );
}

export default App;