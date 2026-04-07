# DocuMind — Backend API

REST API for **DocuMind**: **JWT authentication**, **user-isolated** documents and chats, **async document ingestion** (extract → chunk → persist), and **retrieval-grounded** Q&A with citations. Intended for the Trao Full-Stack AI Engineering assessment.

**Pair with:** [documind-client](../documind-client). This service does not serve the SPA; configure CORS for your frontend origin.

---

## Stack

| Layer | Choice |
|--------|--------|
| Runtime | **Node.js** + **TypeScript** |
| HTTP | **Express 5** |
| Data | **MongoDB** via **Mongoose** |
| Auth | **JWT** (access + refresh), **bcrypt** password hashing |
| Ingestion | **pdf-parse**, **mammoth** (DOCX), **JSZip** + slide XML (PPTX); in-process **worker queue** with retries |
| AI | Optional OpenAI embeddings + grounded generation with safe fallback |

---

## Architecture (modules)

```
src/
  server.ts              # HTTP server entry
  app.ts                 # Express app, CORS, JSON limits, error handler
  routes/index.ts        # Mount /api/auth, /api/documents, /api/chats
  modules/
    auth/                # register, login, refresh, me, profile
    user/                # User model
    document/            # CRUD, upload, ingestion/, chunk model, processing queue
    chat/                # chats, ask, suggestions, feedback
      rag/               # retrieval.service.ts, response-composer.ts
  utils/                 # API envelope, HTTP errors
uploads/                 # Per-user file storage: uploads/<userId>/...
```

- **Isolation:** Every query scopes by `userId` from the verified access token.
- **RAG (current):** Hybrid retrieval (lexical + optional embedding similarity). If `OPENAI_API_KEY` is not set, it automatically falls back to lexical-only ranking and template responses.

---

## Prerequisites

- **Node.js** 20+
- **MongoDB** 6+ (Atlas or local)

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Create **`.env`** in this directory:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017
MONGODB_DB_NAME=documind
JWT_SECRET=change-me-to-a-long-random-string
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Production: restrict **`cors()`** in `src/app.ts` to your Next.js origin instead of open CORS if you expose this API publicly.

### 3. Run (development)

```bash
npm run dev
```

API listens on `http://localhost:${PORT}` (default **5000**).

### 4. Compile

```bash
npm run build
```

Runs `tsc`. Production entry: **`npm start`** → `node dist/server.js`.

---

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Sign up |
| POST | `/api/auth/login` | No | Sign in |
| POST | `/api/auth/refresh` | No | New access token |
| GET | `/api/auth/me` | Yes | Current user |
| PUT | `/api/auth/profile` | Yes | Update name/email |
| POST | `/api/auth/account/delete` | Yes | Delete account (`password` in JSON body) |
| GET | `/api/documents/processing/health` | No | Queue/worker metrics |
| GET | `/api/documents` | Yes | List documents |
| POST | `/api/documents` | Yes | Create metadata (optional path) |
| POST | `/api/documents/upload` | Yes | Upload file (JSON body: base64 + metadata) |
| POST | `/api/documents/upload/multipart` | Yes | Upload file (`multipart/form-data`, field `file`) |
| DELETE | `/api/documents/:id` | Yes | Delete document + chunks |
| GET | `/api/chats` | Yes | List chats |
| GET | `/api/chats/suggestions` | Yes | Starter questions |
| GET | `/api/chats/:chatId` | Yes | Messages |
| POST | `/api/chats/ask` | Yes | Ask (retrieve + grounded reply + citations) |
| POST | `/api/chats/:chatId/messages/:messageId/feedback` | Yes | thumbs up/down |

Responses use a consistent envelope: `{ status, message, data, error }`.

---

## Document lifecycle

1. **Upload** — File saved under `uploads/<userId>/`, row `status: uploaded`.
2. **Worker** — Job dequeued → `processing` → extract text → chunk → optional per-chunk embeddings (if OpenAI key exists) → replace `DocumentChunk` rows → `ready` or `failed` (with retries).

---

## Security notes

- Passwords never stored plain text.
- Access token proves identity; all document/chat routes require it.
- Filenames sanitized; upload size limits enforced server-side.

---

## Deploying

1. Provision **MongoDB** (URI in `MONGO_URI`).
2. Set strong **`JWT_SECRET`** and token expiries.
3. Run a single instance **or** accept that the in-process queue is not distributed across machines.
4. Update CORS in `app.ts` so only your deployed Next.js origin can call the API.
5. Persist **`uploads/`** on disk or migrate to object storage for multi-instance setups.

---

## Limitations (honest)

- **.ppt** (legacy binary) is not fully extracted; prefer **.pptx**.
- Embeddings and generated answers require `OPENAI_API_KEY`; without it, lexical retrieval + deterministic fallback responses are used.
- **Multipart** upload is available on `POST /api/documents/upload/multipart`; JSON base64 upload remains for API clients that prefer it.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | `ts-node-dev` / dev entry |
| `npm run build` | `tsc` compile |
| `npm start` | Production start (see `package.json`) |
| `npm run test:e2e:smoke` | Curl-based smoke flow (register/upload/ask) |

---

## Full-system docs

See the **[repository root README](../README.md)** for end-to-end diagrams, assessment checklist, and narrative (if this repo is part of a monorepo).
