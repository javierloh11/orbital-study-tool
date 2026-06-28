# Stitch.io

**Orbital 2026 – Vostok Tier**

**Team Members**

- Javier Loh
- Ivan Tan

---

# Table of Contents

1. [Project Overview](#1-project-overview)
2. [User Stories](#2-user-stories)
3. [Features and Design of Application](#3-features-and-design-of-application)
4. [System Architecture](#4-system-architecture)
5. [Development Plan](#5-development-plan)
6. [Current Progress and Technical Proof](#6-current-progress-and-technical-proof)
7. [Documentation of System](#7-documentation-of-system)
8. [Installation and Setup](#8-installation-and-setup)
9. [Future Work](#9-future-work)

---

# 1. Project Overview

## Motivation

Students today are exposed to an overwhelming amount of study material throughout a semester. Lecture slides, tutorial worksheets, textbook excerpts, handwritten notes, and revision documents often accumulate across multiple modules and are stored in different formats. While these resources contain valuable information, they are rarely organised in a way that facilitates efficient revision.

Many students spend a significant amount of time manually rewriting notes, creating flashcards, and summarising lecture content before they can begin studying effectively. Although these study techniques are widely recognised for improving retention and promoting active recall, preparing these materials is often repetitive and time-consuming. Consequently, students may either postpone creating revision resources or choose to study directly from lengthy notes, reducing the effectiveness of their revision.

With recent advances in large language models, it is now possible to automate much of this preparation process. By intelligently extracting important concepts and generating structured study materials, AI can significantly reduce the amount of manual work required while allowing students to focus on understanding concepts instead of organising information.

This project was motivated by the desire to bridge the gap between raw study materials and effective revision resources through an intuitive and accessible web application.

## Aim

The aim of Stitch.io is to develop an AI-powered web application that assists students in transforming their study materials into structured revision resources.

Rather than replacing traditional studying, Stitch.io serves as a productivity tool that accelerates the preparation stage of revision. Users may upload study materials in multiple formats, after which the system automatically extracts important concepts and generates educational resources that support different learning styles.

The application currently supports:

- Automatic extraction of key concepts
- AI-generated flashcards
- Individual note summaries
- Subject-wide summary sheets
- Persistent cloud storage of generated materials
- Organisation of notes by subject
- Secure user authentication

By combining these features into a single workflow, Stitch.io provides students with a centralised platform for creating, organising, and revisiting personalised study resources.

## Objectives

The primary objectives of the project are:

- Reduce the time required to prepare revision materials.
- Support multiple study material formats, including text, PDF documents and images.
- Automatically identify and extract important concepts from uploaded notes.
- Generate high-quality flashcards that encourage active recall.
- Produce concise summaries for efficient revision.
- Allow users to organise study materials under different academic subjects.
- Store generated content securely for future study sessions.
- Provide a simple, intuitive, and accessible user experience.

## Why "Stitch.io"?

The name **Stitch.io** reflects the core philosophy of our application.

Students often have notes scattered across different files, formats, and subjects. Stitch.io "stitches" these fragmented resources together by processing, organising, and transforming them into cohesive revision materials. Instead of viewing uploaded documents as isolated files, the application connects them into a growing knowledge base that users can continually build upon throughout the semester.

This concept is particularly evident through the Subject Summary Sheet feature, where multiple individual notes are combined into a single comprehensive revision sheet.

---

# 2. User Stories

The application is designed around the workflow of university students preparing for quizzes, assignments, and examinations. The following user stories guided the design and implementation of the system.

### User Story 1

**As a student preparing for an examination, I want to upload my study materials so that I can quickly transform them into useful revision resources.**

Students should be able to submit notes through multiple input methods without manually retyping their content.

### User Story 2

**As a student studying different modules, I want to organise my notes under different subjects so that my study materials remain structured and easy to retrieve.**

Users should be able to manage multiple modules independently without mixing their revision materials.

### User Story 3

**As a student who values efficiency, I want the system to automatically identify the important concepts from my notes so that I do not have to manually search for key information.**

The application should perform key point extraction immediately after processing uploaded content.

### User Story 4

**As a student using active recall, I want AI-generated flashcards so that I can test my understanding more effectively.**

The generated flashcards should present concise question-and-answer pairs suitable for revision.

### User Story 5

**As a student revising before examinations, I want concise summaries of my notes so that I can quickly review important concepts without rereading lengthy documents.**

The application should generate readable summaries that retain essential information while removing unnecessary detail.

### User Story 6

**As a student studying an entire module, I want to generate a summary sheet from all my saved notes within a selected subject so that I can revise the entire module using a single consolidated cheat sheet.**

Rather than summarising individual documents, the application should combine multiple notes into one comprehensive revision resource.

### User Story 7

**As a returning user, I want my generated study materials to be saved securely so that I can continue studying across multiple sessions without regenerating my notes.**

Persistent storage allows users to gradually build a personal library of revision materials.

### User Story 8

**As a user, I want my study materials to remain private so that only I can access my saved notes.**

Authentication ensures each user's data remains isolated and secure.

### User Story 9

**As a student with different learning preferences, I want to regenerate study materials whenever necessary so that I can obtain outputs that better match my preferred style of learning.**

The system should support flexibility instead of restricting users to a single AI-generated response.

---

# 3. Features and Design of Application

Stitch.io follows an end-to-end workflow that transforms raw study materials into organised revision resources. The application integrates document processing, OCR, AI-powered content generation, cloud storage, and user authentication into a single seamless experience.

The workflow is designed to minimise manual effort while allowing students to generate personalised study materials within a few clicks.

## Overall Workflow

1. User logs into Stitch.io.
2. User selects or creates a subject.
3. User uploads a PDF, image, or pastes text manually.
4. The frontend extracts text where necessary.
5. The backend processes the uploaded content.
6. Important concepts are automatically extracted.
7. Users may generate:
   - Flashcards
   - Individual summaries
8. Generated content is saved to Firebase Firestore.
9. Users can retrieve previous notes at any time.
10. Users may generate a Subject Summary Sheet using all saved notes within a selected subject.
---

## Feature 7: Subject Summary Sheet

### Description

One of Stitch.io's unique features is the ability to generate a comprehensive summary sheet from all saved notes belonging to a selected subject.

Instead of summarising a single uploaded document, the application retrieves every saved note under the chosen subject and consolidates them into a single structured revision sheet. This enables students to revise an entire module using one concise document.

---

### Input

- All saved notes under a selected subject

---

### Processing

The backend retrieves all relevant notes from Firebase Firestore before combining their extracted key points.

The combined content is then sent to the OpenAI API, where the information is reorganised into a concise, well-structured subject summary.

---

### Output

The system generates:

- Comprehensive subject cheat sheet
- Module-wide revision summary
- Consolidated high-yield examination notes

This feature allows students to progressively build their own revision resources throughout the semester instead of relying on a single uploaded document.

---

## Feature 8: Saving Generated Notes

### Description

Users may save generated study materials for future use.

Each saved note stores both the original uploaded content and the AI-generated outputs, allowing users to revisit previous study sessions without regenerating their materials.

---

### Input

Generated revision materials including:

- Original notes
- Extracted key points
- Flashcards
- Individual summary
- Subject information

---

### Processing

The backend verifies the user's authentication token before storing the note inside Firebase Firestore.

Each saved note is associated with:

- User ID
- Subject
- Note title
- Original content
- Generated outputs
- Timestamp

---

### Output

Users are able to:

- Retrieve previous notes
- Continue studying across multiple sessions
- Build a growing library of revision materials

---

## Feature 9: Study Mode

### Description

Generated flashcards may be reviewed directly within Stitch.io through a dedicated study interface.

Instead of simply displaying flashcards as text, Study Mode presents them one at a time, encouraging students to actively recall answers before revealing the solution.

---

### Input

Previously generated flashcards.

---

### Processing

The frontend organises flashcards into an interactive study session while allowing users to navigate through the generated cards.

---

### Output

The application provides:

- Interactive flashcard review
- Active recall practice
- More engaging revision experience

---

## Feature 10: Editing and Regeneration

### Description

AI-generated outputs may not always perfectly match a user's preferred learning style.

Stitch.io therefore allows users to regenerate flashcards and summaries whenever necessary, producing alternative outputs while retaining the original uploaded notes.

Future versions may also support manual editing before saving.

---

### Input

Previously generated AI outputs.

---

### Processing

The backend resubmits the processed notes to the OpenAI API using the appropriate prompt.

---

### Output

- Regenerated flashcards
- Regenerated summaries
- Improved flexibility for different learning preferences

---

## Overall Application Workflow

The complete workflow of Stitch.io is illustrated below.

```text
                        User
                          │
                          ▼
                Login / Authentication
                          │
                          ▼
             Create or Select Subject
                          │
                          ▼
      Upload Study Materials / Paste Text
                          │
      ┌───────────────────┼────────────────────┐
      ▼                   ▼                    ▼
 Manual Text         PDF Processing        OCR Processing
                        │                    │
                        └──────────┬─────────┘
                                   ▼
                          Extracted Text
                                   │
                                   ▼
                       Automatic Key Point Extraction
                                   │
               ┌───────────────────┼─────────────────────┐
               ▼                   ▼                     ▼
        Flashcards         Individual Summary      Save Notes
               │                   │                     │
               └───────────────────┴──────────────┐
                                                  ▼
                                      Firebase Firestore
                                                  │
                                ┌─────────────────┴────────────────┐
                                ▼                                  ▼
                       Retrieve Saved Notes          Subject Summary Sheet
                                │                                  │
                                └──────────────────┬───────────────┘
                                                   ▼
                                              Study Mode
```

---

# 4. System Architecture

Stitch.io follows a modern client-server architecture consisting of a React frontend, an Express backend, Firebase services, and the OpenAI API.

Each component performs a specialised role within the application while communicating through RESTful APIs.

---

## High-Level Architecture

```text
                           User
                             │
                             ▼
                    React Frontend (Vite)
                             │
                      REST API Requests
                             │
                             ▼
                    Express Backend (Node.js)
                ┌────────────┼────────────┐
                ▼            ▼            ▼
          OpenAI API   Firebase Auth  Firestore
                │            │            │
                └────────────┼────────────┘
                             ▼
                   AI Generated Outputs
                             │
                             ▼
                      React Frontend
                             │
                             ▼
                           User
```

---

## Frontend

The frontend is developed using **React** and **Vite**.

Its responsibilities include:

- User authentication
- Subject management
- Accepting manual note input
- Uploading PDF documents
- Uploading images
- Performing PDF extraction
- Performing OCR processing
- Displaying generated outputs
- Retrieving saved notes
- Generating subject summary sheets
- Providing Study Mode

The frontend is designed to provide a clean and intuitive user interface while handling client-side processing before communicating with the backend.

---

## Backend

The backend is implemented using **Node.js** and **Express.js**.

Its responsibilities include:

- Receiving frontend requests
- Validating authentication tokens
- Processing uploaded content
- Constructing prompts for OpenAI
- Generating AI-powered study materials
- Managing Firestore operations
- Returning generated results

The backend acts as the central controller of the application.

---

## OpenAI Integration

The application uses the OpenAI API to generate educational content.

Current AI functionalities include:

- Automatic key point extraction
- Flashcard generation
- Individual summaries
- Subject summary sheets

The backend constructs specialised prompts for each feature before submitting requests to the language model.

---

## Firebase Authentication

Firebase Authentication manages user login and identity verification.

Each authenticated user receives a secure token that is verified by the backend before any database operations are performed.

Authentication ensures:

- User privacy
- Secure access control
- Personalised study libraries

---

## Firebase Firestore

Firestore serves as the application's cloud database.

Each saved note contains:

- User ID
- Subject
- Note title
- Original uploaded notes
- Extracted key points
- Flashcards
- Individual summary
- Timestamp

This enables users to retrieve and organise study materials across multiple sessions.

---

## File Processing Pipeline

### Manual Text

1. User pastes notes.
2. Frontend sends text directly to backend.
3. Backend performs AI processing.

---

### PDF Documents

1. User uploads PDF.
2. pdfjs-dist extracts text.
3. Extracted text is sent to backend.
4. Backend performs AI generation.

---

### Images

1. User uploads image.
2. Tesseract OCR extracts text.
3. Extracted text is sent to backend.
4. Backend performs AI processing.

---

## Data Flow

The complete data flow within Stitch.io is summarised below.

1. User authenticates.
2. User selects a subject.
3. User uploads study materials.
4. Frontend extracts text if necessary.
5. Backend processes uploaded content.
6. OpenAI generates educational outputs.
7. Generated content is returned to the frontend.
8. User saves generated materials.
9. Firestore stores user-specific notes.
10. Users retrieve saved notes or generate subject summary sheets.

# 5. Development Plan

The project followed an incremental development approach, with each milestone building upon the previous one. Rather than implementing every feature simultaneously, we prioritised establishing a stable end-to-end workflow before progressively introducing more advanced functionality.

---

## Milestone 1 – Technical Proof of Concept

### Objectives

- Establish frontend-backend communication.
- Integrate the OpenAI API.
- Support manual text input.
- Support PDF document uploads.
- Implement automatic key point extraction.
- Generate AI-powered flashcards.
- Build a complete workflow from user input to generated outputs.

### Deliverables

Completed:

- React frontend
- Express backend
- OpenAI API integration
- Manual text input
- PDF upload support
- Automatic key point extraction
- Flashcard generation
- Responsive user interface
- Error handling and loading indicators

Milestone 1 successfully demonstrated a working proof of concept that transformed uploaded study materials into AI-generated revision resources.

---

## Milestone 2 – Prototype Development

### Objectives

- Add image upload support.
- Integrate OCR processing.
- Implement summary generation.
- Introduce user authentication.
- Integrate Firebase Firestore.
- Enable persistent storage of generated notes.
- Improve overall interface and usability.

### Deliverables

Completed:

- Image upload
- OCR using Tesseract.js
- Individual note summaries
- Firebase Authentication
- Firestore integration
- Save and retrieve notes
- Subject management
- Improved UI

Milestone 2 expanded the application into a fully functional prototype capable of supporting multiple users and persistent cloud storage.

---

## Milestone 3 – Extended Features

### Objectives

- Implement subject summary sheets.
- Improve study workflow.
- Introduce Study Mode.
- Improve AI-generated outputs.
- Refine overall user experience.

### Deliverables

Completed:

- Subject Summary Sheet generation
- Study Mode
- Improved AI prompts
- Better organisation of saved notes
- Enhanced frontend interface
- Improved backend architecture

The final version of Stitch.io now supports an end-to-end workflow from note submission to long-term revision management.

---

# 6. Current Progress and Technical Proof

## Current Implementation Status

The current implementation successfully supports the complete workflow of Stitch.io.

Implemented features include:

### Authentication

- User login
- Firebase Authentication
- User-specific study materials

### Study Material Processing

- Manual text input
- PDF upload
- Image upload
- OCR processing
- Automatic text extraction

### AI Processing

- Automatic key point extraction
- Flashcard generation
- Individual note summaries
- Subject summary sheets

### Database

- Firebase Firestore
- Save generated notes
- Retrieve saved notes
- Subject organisation

### Study Features

- Study Mode
- Regeneration
- Subject management

---

## Technical Proof

The screenshots below demonstrate the implementation of the application's major features.

### Screenshot 1 – Login Page

```markdown
![Login](screenshots/login.png)
```

Users authenticate through Firebase Authentication before accessing their personalised workspace.

---

### Screenshot 2 – Main Dashboard

```markdown
![Dashboard](screenshots/dashboard.png)
```

The dashboard allows users to create subjects, upload notes, generate study materials, and manage saved content.

---

### Screenshot 3 – Upload Study Materials

```markdown
![Upload](screenshots/upload.png)
```

Users may upload PDFs, images, or manually paste text.

---

### Screenshot 4 – Automatic Key Point Extraction

```markdown
![Key Points](screenshots/keypoints.png)
```

The application automatically extracts important concepts immediately after processing uploaded study materials.

---

### Screenshot 5 – Flashcard Generation

```markdown
![Flashcards](screenshots/flashcards.png)
```

Flashcards are generated using the extracted key points to support active recall learning.

---

### Screenshot 6 – Individual Summary

```markdown
![Summary](screenshots/summary.png)
```

The application generates concise summaries that condense lengthy notes into revision-friendly formats.

---

### Screenshot 7 – Saved Notes

```markdown
![Saved Notes](screenshots/savednotes.png)
```

Generated materials are stored securely in Firestore and organised by subject.

---

### Screenshot 8 – Subject Summary Sheet

```markdown
![Subject Summary](screenshots/subjectsummary.png)
```

Multiple saved notes are combined into a comprehensive module-wide revision sheet.

---

## Evaluation

The project successfully achieved its original objectives.

Compared to the initial proof of concept, Stitch.io has evolved into a complete AI-assisted revision platform supporting:

- Secure authentication
- Cloud storage
- Multi-format note submission
- OCR processing
- AI-powered study material generation
- Subject organisation
- Long-term revision management

---

# 7. Documentation of System

## Frontend

The frontend is implemented using React and Vite.

Responsibilities include:

- Authentication
- Subject management
- File uploads
- OCR processing
- PDF extraction
- API communication
- Displaying generated outputs
- Managing Study Mode

---

## Backend

The backend is implemented using Express.js.

Responsibilities include:

- AI prompt construction
- Authentication verification
- Firestore communication
- API request handling
- Error handling
- Generation of revision materials

---

## Database

Firebase Firestore stores all user-generated content.

Each document contains:

- User ID
- Subject
- Note title
- Original notes
- Key points
- Flashcards
- Summary
- Timestamp

---

## API Endpoints

### POST `/api/keypoints`

Generates key points from uploaded notes.

Input:

```json
{
  "notes": "Study material"
}
```

---

### POST `/api/flashcards`

Generates flashcards.

Input:

```json
{
  "notes": "Study material"
}
```

---

### POST `/api/summary`

Generates an individual summary.

Input:

```json
{
  "notes": "Study material"
}
```

---

### POST `/api/save`

Stores generated study materials inside Firestore.

---

### GET `/saved-notes/:subject`

Retrieves all saved notes belonging to a subject.

---

### POST `/api/subject-summary`

Generates a summary sheet using every saved note within a subject.

---

## Error Handling

The application includes:

- Empty input validation
- Authentication verification
- File validation
- OCR validation
- API error handling
- Firestore error handling
- Loading indicators

These mechanisms improve reliability while providing meaningful feedback to users.

---

# 8. Installation and Setup

## Prerequisites

Before running Stitch.io, install:

- Node.js
- npm
- Git

You will also require:

- OpenAI API Key
- Firebase Project
- Firebase Service Account Key

---

## Clone Repository

```bash
git clone https://github.com/javierloh11/orbital-study-tool.git
cd orbital-study-tool
```

---

## Install Frontend

```bash
cd frontend
npm install
```

---

## Install Backend

```bash
cd backend
npm install
```

---

## Environment Variables

Create a `.env` file inside the backend folder.

```env
OPENAI_API_KEY=your_openai_api_key
```

Place the Firebase service account inside:

```text
backend/firebase-key.json
```

---

## Run Backend

```bash
npm run dev
```

Expected output:

```text
Server running on http://localhost:3000
```

---

## Run Frontend

```bash
cd frontend
npm run dev
```

Expected output:

```text
http://localhost:5173
```

---

## Repository Structure

```text
orbital-study-tool
│
├── frontend
│   ├── src
│   ├── public
│   └── package.json
│
├── backend
│   ├── server.js
│   ├── firebase.js
│   ├── firebase-key.json
│   ├── package.json
│   └── .env
│
├── screenshots
│
└── README.md
```

---

# 9. Future Work

Although Stitch.io already provides a complete AI-assisted revision workflow, several enhancements can further improve the learning experience.

## Planned Improvements

- Export flashcards as Anki decks
- Export summaries as PDF
- Rich text editing before saving
- AI-generated quizzes
- Smart recommendations based on previous notes
- Spaced repetition scheduling
- Dark mode
- Collaborative note editing

---

## Long-Term Vision

Our long-term vision is for Stitch.io to become an integrated AI-powered learning platform that supports students throughout an entire semester.

Rather than functioning solely as a flashcard generator or summarisation tool, Stitch.io aims to become a personal knowledge management system where students can continuously upload notes, organise them by subject, generate revision resources, and revisit them throughout their academic journey.

By automating repetitive preparation tasks while preserving user control over the learning process, Stitch.io seeks to help students spend less time organising study materials and more time understanding, practising, and mastering concepts.