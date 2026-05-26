const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;


app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("Backend is running");
});


app.post("/api/flashcards", (req, res) => {
  const { notes } = req.body;

  console.log("Received notes:", notes);

  
  const flashcards = [
    {
      question: "What is React?",
      answer: "A JavaScript library for building user interfaces."
    },
    {
      question: "What is Express?",
      answer: "A backend framework for Node.js."
    }
  ];

  res.json({ flashcards });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});