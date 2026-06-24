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

function parseFlashcards(aiResponse) {
  try {
    return JSON.parse(aiResponse);
  } catch {
    const match = aiResponse.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error("No JSON array found");
    }
    return JSON.parse(match[0]);
  }
}

app.post("/api/flashcards", async (req, res) => {
  try {
    const { notes } = req.body;
    const notesText = typeof notes === "string" ? notes : notes?.originalText || "";

    if (!notesText.trim()) {
      return res.status(400).json({ error: "No notes provided" });
    }

    const prompt = `
Convert the following notes into flashcards.

Return ONLY valid JSON in this format:
[
  {
    "question": "question here",
    "answer": "answer here"
  }
]

Rules:
- Make each question clear and useful for studying.
- Answers should be concise but complete.
- Do not include markdown.
- Do not include explanations outside the JSON.
- Generate 5 to 10 flashcards if possible.

Notes:
${notesText}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const aiResponse = completion.choices[0].message.content;
    const flashcards = parseFlashcards(aiResponse);

    res.json({ flashcards });
  } catch (error) {
    console.error("Failed to generate flashcards:", error);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

app.post("/api/process-notes", async (req, res) => {
  try {
    const { notes } = req.body;
    const notesText = typeof notes === "string" ? notes : notes?.originalText || "";

    if (!notesText.trim()) {
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
${notesText}
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
    const { keyPoints } = req.body;

    if (!keyPoints || !keyPoints.trim()) {
      return res.status(400).json({
        error: "No key points provided",
      });
    }

    const prompt = `
Create a concise study summary using ONLY the key points below.

Rules:
- Maximum 250 words
- Use bullet points
- Keep explanations concise
- Focus on understanding and revision

Key Points:
${keyPoints}
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

    res.json({
      summary: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to generate summary",
    });
  }
});

app.post("/subjects", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { subject } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: "No subject provided" });
    }

    const subjectName = subject.trim();

    await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subjectName)
      .set({
        name: subjectName,
        createdAt: new Date(),
      });

    res.json({
      success: true,
      subject: subjectName,
    });
  } catch (error) {
    console.error("Error creating subject:", error);
    res.status(500).json({ error: "Failed to create subject" });
  }
});

app.get("/subjects", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;

    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .get();

    const subjects = snapshot.docs.map((doc) => doc.id);

    res.json(subjects);
  } catch (error) {
    console.error("Error retrieving subjects:", error);
    res.status(500).json({ error: "Failed to retrieve subjects" });
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
  summary,
  sourceType,
} = req.body;

    const subjectName = subject || "General";

    await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subjectName)
      .set(
        {
          name: subjectName,
          updatedAt: new Date(),
        },
        { merge: true }
      );

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
  flashcards: flashcards || [],
  summary: summary || "",
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

app.delete("/saved-notes/:subject/:noteId", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { subject, noteId } = req.params;

    await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subject)
      .collection("notes")
      .doc(noteId)
      .delete();

    res.json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).json({ error: "Failed to delete note" });
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
      .filter(Boolean)
      .join("\n\n");

    if (!allKeyPoints.trim()) {
      return res.status(400).json({ error: "No key points found" });
    }

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});