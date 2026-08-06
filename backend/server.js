const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const { db, auth } = require("./firebase");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = [
  "http://localhost:5173",
  "https://orbital-study-tool.vercel.app",
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((url) => url.trim().replace(/\/$/, ""));

console.log("Allowed CORS origins:", allowedOrigins);


const corsOptions = {
  origin(origin, callback) {
    // Allow Postman, Render health checks and other non-browser requests
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.trim().replace(/\/$/, "");

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.error("Blocked CORS origin:", origin);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use(
  express.json({
    limit: "10mb",
  })
);

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
  lectureVisuals,
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
  lectureVisuals: lectureVisuals || [],
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


app.put("/saved-notes/:subject/:noteId", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { subject, noteId } = req.params;
    const {
      title,
      originalText,
      keyPoints,
      flashcards,
      summary,
      lectureVisuals,
      layout,
      sourceType,
    } = req.body;

    const noteRef = db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subject)
      .collection("notes")
      .doc(noteId);

    const noteSnapshot = await noteRef.get();

    if (!noteSnapshot.exists) {
      return res.status(404).json({ error: "Saved note not found" });
    }

    const updates = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updates.title = title.trim() || "Untitled Note";
    if (originalText !== undefined) updates.originalText = originalText;
    if (keyPoints !== undefined) updates.keyPoints = keyPoints;
    if (flashcards !== undefined) updates.flashcards = Array.isArray(flashcards) ? flashcards : [];
    if (summary !== undefined) updates.summary = summary;
    if (lectureVisuals !== undefined) {
      updates.lectureVisuals = Array.isArray(lectureVisuals) ? lectureVisuals : [];
    }
    if (layout !== undefined) updates.layout = layout;
    if (sourceType !== undefined) updates.sourceType = sourceType;

    await noteRef.set(updates, { merge: true });

    res.json({
      success: true,
      id: noteId,
      ...updates,
    });
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(500).json({ error: "Failed to update note" });
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


app.get("/subject-summary/:subject/saved", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const subject = req.params.subject;

    const subjectSnapshot = await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subject)
      .get();

    if (!subjectSnapshot.exists) {
      return res.json({ summary: "" });
    }

    res.json({
      summary: subjectSnapshot.data().subjectSummary || "",
      updatedAt: subjectSnapshot.data().subjectSummaryUpdatedAt || null,
    });
  } catch (error) {
    console.error("Error retrieving subject summary:", error);
    res.status(500).json({ error: "Failed to retrieve subject summary" });
  }
});

app.put("/subject-summary/:subject", verifyUser, async (req, res) => {
  try {
    const uid = req.user.uid;
    const subject = req.params.subject;
    const { summary } = req.body;

    if (typeof summary !== "string" || !summary.trim()) {
      return res.status(400).json({ error: "No subject summary provided" });
    }

    await db
      .collection("users")
      .doc(uid)
      .collection("subjects")
      .doc(subject)
      .set(
        {
          name: subject,
          subjectSummary: summary,
          subjectSummaryUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );

    res.json({ success: true });
  } catch (error) {
    console.error("Error saving subject summary:", error);
    res.status(500).json({ error: "Failed to save subject summary" });
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

    const lectureNotes = snapshot.docs
  .map((doc, index) => {
    const note = doc.data();

    if (!note.keyPoints?.trim()) {
      return null;
    }

    return `
LECTURE ${index + 1}
Title: ${note.title || `Lecture ${index + 1}`}

Key Points:
${note.keyPoints}
`;
  })
  .filter(Boolean)
  .join("\n\n---\n\n");

    if (!lectureNotes.trim()) {
      return res.status(400).json({ error: "No key points found" });
    }

    const completion = await openai.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [
    {
      role: "user",
      content: `
You are an experienced university professor creating a consolidated subject revision sheet from multiple lectures.

Your goal is NOT to combine every bullet point.

Your goal is to identify, merge, and organise only the most important examinable concepts across all lectures.

Before writing:

1. Read every lecture separately.
2. Identify repeated concepts across lectures.
3. Merge overlapping ideas.
4. Remove duplicated, trivial, or administrative information.
5. Preserve important distinctions between topics.
6. Prioritise concepts most likely to appear in an exam.

Requirements:

- Maximum 900 words.
- Use Markdown.
- Do not include an overall title.
- Do not use Markdown tables.
- Do not generate Mermaid diagrams.
- Use short sections and concise bullet points.
- Maximum 6 bullets per section.
- Avoid long paragraphs.
- Do not repeat the same concept in different sections.
- Do not include every lecture example.
- Include code only when essential.
- Code examples must be fewer than 4 lines.
- Do not invent information.

Use this structure:

## Subject Overview
- Summarise the subject in no more than 3 bullets.

## Core Concepts
- Include the most important concepts across all lectures.
- Begin each bullet with a bold concept name.

## Key Relationships
- Explain how important concepts connect or differ.
- Include comparisons such as inheritance versus interfaces only when relevant.

## Essential Rules and Syntax
- Include only rules, syntax, formulas, or code patterns worth memorising.

## Common Mistakes
- Include likely misconceptions or exam mistakes.

## Final Revision Checklist
- Include 5 to 8 questions students should be able to answer before the exam.

Multiple lecture materials:

${lectureNotes}
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
