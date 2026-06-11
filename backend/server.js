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
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const aiResponse = completion.choices[0].message.content;

    res.json({
      flashcards: aiResponse,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Something went wrong",
    });
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
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const keyPoints = completion.choices[0].message.content;

    res.json({ keyPoints });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to process notes",
    });
  }
});

app.post("/save-note", async (req, res) => {
  try {
    const {
      title,
      originalText,
      keyPoints,
      flashcards,
      sourceType
    } = req.body;

    const docRef = await db.collection("notes").add({
      title,
      originalText,
      keyPoints,
      flashcards,
      sourceType,
      createdAt: new Date()
    });

    res.json({
      success: true,
      id: docRef.id
    });

  } catch (error) {
    console.error("Error saving note:", error);

    res.status(500).json({
      error: "Failed to save note"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});