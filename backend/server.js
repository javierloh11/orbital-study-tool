const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const { db, auth } = require("./firebase");

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

    if (!notes || notes.trim().length === 0) {
      return res.status(400).json({ error: "No notes provided" });
    }

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

    if (!notes || notes.trim().length === 0) {
      return res.status(400).json({ error: "No notes provided" });
    }

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

app.post("/api/summary", async (req, res) => {
  try {
    const { notes } = req.body;
    const notesText = typeof notes === "string" ? notes : notes?.originalText || "";

    if (!notesText.trim()) {
      return res.status(400).json({ error: "No notes provided" });
    }

    const prompt = `
You are an expert university tutor.

Create a HIGH-YIELD EXAM CHEAT SHEET from the notes below.

Your goal is NOT to summarise everything.

Your goal is to identify the MOST IMPORTANT and MOST TESTABLE concepts.

Rules:
- Maximum 500 words
- No code blocks
- No markdown tables
- No repeated information
- No long paragraphs
- Use concise bullet points
- Focus on understanding and exam preparation
- Prioritise concepts likely to appear in quizzes, tests and exams

Output exactly in this format:

# Topic

## 30-Second Summary
(3 concise sentences maximum)

## Must-Know Concepts
(5-8 bullets)

## Key Definitions
(Maximum 5 definitions)

## High-Yield Comparisons
Format:
Concept A vs Concept B → key difference

Example:
Compile-Time Type vs Run-Time Type → compile-time determines accessible methods, run-time determines executed implementation

## Common Exam Traps
(3-5 bullets)

## Exam Focus
(What lecturers typically test)

## Quick Self-Test
(Exactly 5 questions)

## Last-Minute Checklist
(Exactly 5 checklist items)

Notes:
${notesText}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    res.json({
      summary: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.post("/save-note", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;

    const {
      subject,
      title,
      originalText,
      keyPoints,
      flashcards,
      sourceType,
    } = req.body;

    const subjectName = subject || "General"

    const docRef = await db
    .collection("users")
    .doc(uid)
    .collection("subjects")
    .doc(subjectName)
    .collection("notes")
    .add({
      title: title || "Untitled Note",
      originalText: originalText || "",
      keyPoints: keyPoints || "",
      flashcards: flashcards || "",
      sourceType: sourceType || "text",
      createdAt: new Date(),
    });

    res.json({
      success: true,
      id: docRef.id,
    });
  } catch (error) {
    console.error("Error saving note:", error);
    res.status(500).json({ error: "Failed to save note" });
  }
});

app.get("/summary/:subject", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const subject = req.params.subject;

    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subject)
      .collection("notes")
      .get();

    const allKeyPoints = snapshot.docs
      .map((doc) => doc.data().keyPoints)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: `
Create a concise study summary sheet using these key points:

${allKeyPoints}
`,
        },
      ],
    });

    res.json({
      summary: completion.choices[0].message.content,
    });

    } catch (error) {
      console.error("Error generating subject summary:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
});

app.get("/saved-notes/:subject", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const subject = req.params.subject;

    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subject)
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

async function verifyUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
}