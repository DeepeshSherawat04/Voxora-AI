&lt;div align="center"&gt;

# 🎙️ Voxora AI — Autonomous Voice Sales Agent

**An AI voice bot that sells SaaS over a real-time phone-style conversation — with live transcription, call recording, AI summaries, and automatic sales-status classification.**

Built in 48 hours for the **Sankar Group Intern Assignment**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.156-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Groq](https://img.shields.io/badge/LLM-Groq%20gpt--oss--120b-f55036)](https://groq.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org)
[![WebSocket](https://img.shields.io/badge/Realtime-WebSocket-010101?logo=socket.io)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

**🔗 Live Demo:** https://your-app.vercel.app *(coming soon)*
**📹 Video Walkthrough:** [Link](#) *(coming soon)*

&lt;/div&gt;

---

## 🧠 What it does

Voxora's agent **"Aria"** conducts a real, unscripted voice sales call for a SaaS product
(CloudDesk CRM). The customer speaks naturally — Aria listens, understands, answers
objections, mirrors the customer's language (English / Hinglish), and steers the
conversation toward a close. When the call ends, the pipeline automatically produces a
structured summary, objections, next steps, and one of six sales dispositions.

| # | Requirement | How it's implemented |
|---|-------------|----------------------|
| 1 | 🗣️ Voice conversation | Browser-native SpeechRecognition (STT) + SpeechSynthesis (TTS), streaming over a persistent WebSocket — no page reloads |
| 2 | 🌐 Language support | LLM-level language mirroring — detects Hinglish/English mixes and replies in kind, product names stay in English |
| 3 | 💬 Live chat screen | Real-time transcript panel with speaker labels, timestamps, and an animated "typing" indicator |
| 4 | 📞 Call controls | Start/End call, mute toggle, live call timer, connection-status indicators |
| 5 | ⏺️ Call recording | Full-call audio captured client-side via `MediaRecorder`, uploaded to the backend after the call, streamed back for playback — with an explicit consent checkbox before every call |
| 6 | 🤖 AI summary | End-of-call LLM pass generates: summary, customer requirements, objections, next steps, final sentiment |
| 7 | 🏷️ Sales status | Auto-classified into `Converted` / `Interested` / `Follow-up Required` / `Not Interested` / `Demo Requested` / `No Response`, with server-side fallback validation |
| 8 | 🕘 Call history | Persistent history with recordings, transcripts, summaries, statuses, durations, and a per-call transcript viewer |

## ⚡ Architecture

┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React SPA)                       │
│                                                                  │
│  🎤 SpeechRecognition ──► text ──┐                               │
│  🔊 SpeechSynthesis ◄── reply ───┤        ⏺ MediaRecorder        │
│  💬 Live transcript / controls   │        (call audio, WebM)      │
└──────────────┬───────────────────┴───────────────┬───────────────┘
│  WebSocket (full-duplex, /ws/call) │  POST /recording
▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (async)                        │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │ Sales Agent  │──►│ Groq LLM     │──►│ JSON-mode response:   │  │
│  │ (stateful,   │   │ gpt-oss-120b │   │ reply · sentiment ·   │  │
│  │  14-turn cap)│   │ + retries &  │   │ topic · buying_intent │  │
│  └──────────────┘   │  backoff     │   └──────────────────────┘  │
│                     └──────────────┘                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ End-of-call: summarize_call() → CallSummary (validated)  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────┬───────────────────────────────────────────────────┘
▼
┌──────────────────────────────────┐
│  PostgreSQL — calls + messages   │
└──────────────────────────────────┘


## 🎯 Engineering highlights

Things worth noticing if you work with voice AI:

- **Full-duplex WebSocket call loop** — one persistent socket carries start events, customer text, AI replies, live signals (buying intent %, sentiment, topic), and the end-of-call summary packet. No polling, no HTTP round-trips mid-conversation.
- **Exponential-backoff LLM calls** (`chat_json`) — Groq rate limits are retried with `1s → 2s → 4s` backoff so a transient 429 never kills a live call.
- **Smoothed live buying-intent** — intent updates use a 60/40 exponential moving average so the on-screen gauge doesn't jitter turn-to-turn.
- **Echo suppression** — mic capture is paused while the agent speaks (`speechSynthesis`) and auto-resumes on `onend`, preventing the agent from transcribing its own voice.
- **Conversation guardrails** — a 14-turn safety valve injects a "wrap up now" system hint so calls always close gracefully; server-side validation forces `No Response` only when the customer truly never spoke (a common LLM misclassification).
- **Defensive JSON parsing** — LLM output is stripped of markdown fences, enum-validated, and falls back safely on drift.
- **Non-blocking I/O** — blocking LLM calls run in a thread pool (`asyncio.to_thread`) so one slow generation never stalls the event loop or other calls.

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Web Speech API, MediaRecorder |
| Backend | FastAPI, Uvicorn, WebSockets, SQLAlchemy 2.x |
| LLM | Groq — `openai/gpt-oss-120b` (JSON mode) |
| Database | PostgreSQL 16 (Docker) |
| Deploy | Vercel (frontend) · Render (backend + managed Postgres) |

## 🚀 Run locally

**Prerequisites:** Python 3.11+, Node 18+, a PostgreSQL database, a free [Groq API key](https://console.groq.com).

```bash
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env            # fill in GROQ_API_KEY + DATABASE_URL
uvicorn app.main:app --reload --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # → http://localhost:5173

Open http://localhost:5173 in Chrome or Edge, allow the microphone, and start a call.
☁️ Deploy
Frontend → Vercel with VITE_API_URL=https://<your-backend>.onrender.com
Backend → Render (Web Service + managed PostgreSQL) with env vars GROQ_API_KEY, DATABASE_URL, ALLOWED_ORIGINS
Tables auto-create on startup (Base.metadata.create_all)

📁 Project structure

backend/
├── app/
│   ├── agents/sales_agent.py     # Aria: prompts, state, reply + summary logic
│   ├── models/                   # SQLAlchemy models + Pydantic schemas
│   ├── routes/                   # WebSocket call loop + REST history/recording
│   ├── services/groq_llm.py      # Groq client: JSON mode + retry/backoff
│   ├── config.py                 # pydantic-settings (.env driven)
│   └── main.py                   # App factory, CORS, startup
frontend/
└── src/
    ├── hooks/useCall.js          # Call state machine: mic, TTS, WS, recorder
    └── components/               # LiveCallPanel, TranscriptPanel, SummaryPanel, HistoryTable

🔮 Future work
Server-side STT (Whisper) + streaming TTS for non-Chrome browsers and mobile
Multilingual ASR with language auto-detection (Telugu support)
Post-call analytics dashboard (conversion funnel, objection frequency)
Call interrupt/barge-in handling with VAD

