const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const db = require("./firebase");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.post("/api/flashcards", async (req, res) => {
  try {
    const { notes } = req.body;

    const prompt = `
Convert the following notes into flashcards.

Format:
Q: question
A: answer

Notes:
${notes}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    res.json({
      flashcards: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

app.post("/api/process-notes", async (req, res) => {
  try {
    const { notes } = req.body;

    const prompt = `
Extract the MOST IMPORTANT study points from the notes below.

Return:
- concise bullet points
- important concepts
- definitions
- major ideas only

Notes:
${notes}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    res.json({
      keyPoints: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process notes" });
  }
});

app.post("/save-note", async (req, res) => {
  try {
    console.log("SAVE REQUEST RECEIVED");
    console.log(req.body);

    const {
      title,
      originalText,
      keyPoints,
      flashcards,
      summary,
      sourceType,
    } = req.body;

    const docRef = await db.collection("notes").add({
      title: title || "Untitled Note",
      originalText: originalText || "",
      keyPoints: keyPoints || "",
      flashcards: flashcards || "",
      summary: summary || "",
      sourceType: sourceType || "text",
      createdAt: new Date(),
    });

    console.log("SAVED TO FIRESTORE:", docRef.id);

    res.json({
      success: true,
      id: docRef.id,
    });
  } catch (error) {
    console.error("Error saving note:", error);
    res.status(500).json({ error: "Failed to save note" });
  }
});

app.get("/saved-notes", async (req, res) => {
  try {
    const snapshot = await db
      .collection("notes")
      .orderBy("createdAt", "desc")
      .get();

    const notes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(notes);
  } catch (error) {
    console.error("Error retrieving notes:", error);
    res.status(500).json({ error: "Failed to retrieve notes" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});