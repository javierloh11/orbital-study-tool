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

app.post("/api/select-visual-pages", async (req, res) => {
  try {
    const { pages } = req.body;

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: "No PDF pages provided",
      });
    }

    const pageDescriptions = pages
      .map(
        (page) => `
Page ${page.pageNumber}:
${page.text}
`
      )
      .join("\n");

    const prompt = `
You are selecting the most useful lecture pages for a revision summary sheet.

Choose up to TWO pages that are most likely to contain useful:
- diagrams
- graphs
- flowcharts
- class hierarchies
- architecture diagrams
- relationship diagrams
- visual processes
- comparison tables

Do not select:
- title pages
- administrative pages
- pages containing only plain paragraphs
- pages with only repetitive code examples
- pages with little revision value

Return ONLY a valid JSON array of page numbers.

Example:
[5, 11]

Lecture pages:
${pageDescriptions}
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

    const aiResponse = completion.choices[0].message.content.trim();

    const arrayMatch = aiResponse.match(/\[[\s\S]*?\]/);

    if (!arrayMatch) {
      return res.json({
        selectedPages: [],
      });
    }

    const parsedPages = JSON.parse(arrayMatch[0]);

    const validPageNumbers = new Set(
      pages.map((page) => page.pageNumber)
    );

    const selectedPages = parsedPages
      .filter(
        (pageNumber) =>
          Number.isInteger(pageNumber) &&
          validPageNumbers.has(pageNumber)
      )
      .slice(0, 2);

    res.json({
      selectedPages,
    });
  } catch (error) {
    console.error("Failed to select visual pages:", error);

    res.status(500).json({
      error: "Failed to select visual pages",
    });
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
You are an experienced university professor creating a concise exam revision sheet.

Your goal is NOT to rewrite the lecture notes.

Your goal is to produce a high-quality cheat sheet that a student can read in under 5 minutes before an exam.

Before writing:

1. Read all the key points.
2. Identify the most examinable concepts.
3. Remove duplicated or low-value information.
4. Merge similar ideas.
5. Organise the information into a clean revision sheet.

Requirements:
- Maximum 400 words.
- Use Markdown only.
- Do NOT include an overall title.
- Begin immediately with the first section heading.
- Use concise bullet points only.
- Maximum 5 bullets per section.
- Maximum 15 words per bullet where possible.
- One unique idea per bullet.
- Avoid repeating information between sections.
- Do not invent information.
- Omit sections that are not useful for this topic.

Use the following structure:

## Overview
Summarise the lecture in at most TWO bullet points.

## Core Concepts
Include exactly FIVE of the most important examinable concepts.
Each bullet must begin with a bold concept name.

## Key Definitions
Only include definitions students should memorise.

## Processes / Workflows
Only include this section if the lecture contains an algorithm, workflow, sequence, or process.

## Formulas / Code / Rules
Only include formulas, syntax, or code patterns worth memorising.
Keep code snippets under three lines.

## Common Mistakes
List common exam mistakes or misconceptions.

## Memory Tips
Provide short mnemonics or quick revision tips.

## Visual Summary
Only include this section if a diagram genuinely improves understanding.

Generate exactly ONE Mermaid flowchart.

Rules:
- Maximum 8 nodes.
- Keep labels short.
- Use flowchart TD.
- Do not include styling.
- Avoid special characters inside node names.

Wrap the diagram exactly like this:

\`\`\`mermaid
flowchart TD
A[Concept]
A --> B[Principle]
A --> C[Application]
C --> D[Outcome]
\`\`\`

If a useful diagram cannot be created, omit this section entirely.

Additional rules:
- Never repeat the same concept.
- Never include lecture administration.
- Never include trivial examples.
- Never include long explanations.
- Never include duplicate code examples.
- Prioritise information most likely to appear in exams.

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
  layout,
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
  layout: layout || null,
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

app.get("/subject-summary/:subject", verifyUser, async (req, res) => {
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