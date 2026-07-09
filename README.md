# AI Study Helper

A full-stack study companion built on Node.js + Express, with a swappable AI backend (Anthropic Claude or OpenAI) and a clean, dark, notebook-inspired UI.

## Features

1. **Notes/PDF Summarizer** — paste text or upload a PDF/DOCX/TXT file, get a structured summary (overview, key points, terms, summary).
2. **Quiz & Flashcard Generator** — generates multiple-choice questions and flashcards from your material, with adjustable difficulty (easy/medium/hard) and quantity.
3. **Chat-Based Q&A Tutor** — a conversational tutor that can be grounded in uploaded material, with session-based history.
4. **Step-by-Step Topic Explainer** — enter any topic and get a structured, leveled explanation with a worked example.

## Tech stack

- **Backend:** Node.js + Express
- **AI:** Anthropic Claude API by default, OpenAI as a drop-in alternative (swap via one env var)
- **File handling:** multer (in-memory) + pdf-parse (PDF) + mammoth (DOCX)
- **Frontend:** vanilla HTML/CSS/JS, no build step, dark "digital notebook" themed UI

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
AI_PROVIDER=anthropic          # or "openai"
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6

OPENAI_API_KEY=sk-...          # only needed if AI_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini

PORT=3000
MAX_UPLOAD_MB=10
```

You only need to set the API key for whichever provider you choose in `AI_PROVIDER`.

### 3. Run it

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

Then open **http://localhost:3000**.

## Swapping AI providers

All AI calls go through a single module: `services/aiProvider.js`. It exposes one function, `generate({ system, messages, maxTokens, temperature })`, used by every route. To switch providers, just change `AI_PROVIDER` in `.env` — no route code needs to change. To add a third provider (e.g. a local model), add a `generateWithX()` function there and branch on `PROVIDER`.

## API reference

All endpoints return JSON in the shape `{ success: boolean, ...data }` on success, or `{ success: false, error: string }` on failure. AI endpoints are rate-limited to 60 requests / 15 minutes per IP by default (see `server.js`).

### `POST /api/summarize`
`multipart/form-data` with either/both:
- `text` (string) — pasted content
- `file` — PDF, DOCX, or TXT file

Response: `{ success, summary, meta: { sourceCharCount, truncated } }`

### `POST /api/quiz`
`multipart/form-data` with:
- `text` and/or `file` (as above)
- `difficulty` — `easy` | `medium` | `hard` (default `medium`)
- `mcqCount` — 1–20 (default 5)
- `flashcardCount` — 1–20 (default 5)

Response: `{ success, difficulty, mcqs: [{question, options, correctIndex, explanation}], flashcards: [{front, back}] }`

### `POST /api/chat/session`
`multipart/form-data` with optional `text` / `file` to seed context.

Response: `{ success, sessionId, meta: { sourceCharCount, truncated, hasContext } }`

### `POST /api/chat/message`
JSON body: `{ sessionId, message }`

Response: `{ success, reply, sessionId }`

### `POST /api/explain`
JSON body: `{ topic, level }` where `level` is `beginner` | `intermediate` | `advanced` (default `beginner`).

Response: `{ success, topic, level, explanation }`

### `GET /api/health`
Basic health check, returns the active AI provider.

## Project structure

```
ai-study-helper/
├── server.js                # Express app entry point
├── routes/
│   ├── summarize.js
│   ├── quiz.js
│   ├── chat.js
│   └── explain.js
├── services/
│   ├── aiProvider.js         # Swappable Claude/OpenAI abstraction
│   └── sessionStore.js       # In-memory chat session store
├── middleware/
│   └── upload.js             # multer + PDF/DOCX text extraction
├── utils/
│   └── textUtils.js          # Validation + content length clamping
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
└── package.json
```

## Notes on scaling this up

- **Chat sessions** are stored in memory (`services/sessionStore.js`) and will reset if the server restarts, and won't work across multiple server instances. For production, swap this for Redis or a database — the module's three functions (`getSession`, `createSession`, `appendMessage`) are the only surface you'd need to reimplement.
- **Rate limiting** is per-IP and in-memory; behind a proxy/load balancer you may want to configure `trust proxy` in Express and/or use a shared store for the limiter.
- **File uploads** are handled entirely in memory (never written to disk) and capped at `MAX_UPLOAD_MB` (default 10MB).
