# Resume Engine

A local job search tool that scores job descriptions against your experience, tailors your resume for each role, and searches for new listings automatically via Exa.

Everything runs on your machine. No accounts, no cloud storage — just a local SQLite database and your API keys.

---

## What it does

**Tailor tab** — paste a job description and get back:
- A fit score across 6 dimensions (hard requirements, domain, seniority, etc.)
- A tailored resume optimized for that role
- A blind match evaluation of the tailored resume against the JD
- A short outreach blurb

**Scout tab** — automated job discovery:
- Runs semantic searches via [Exa](https://exa.ai) against job posting sites
- Scores each listing using the same fit assessment pipeline
- Surface high-fit listings for one-click tailoring

Processing happens in a background queue (5 concurrent Claude calls). You can paste new JDs without waiting.

---

## Prerequisites

- [Node.js](https://nodejs.org) v20 or later
- An [Anthropic API key](https://console.anthropic.com) (uses `claude-sonnet-4-20250514`)
- An [Exa API key](https://exa.ai) (optional — only needed for Scout searches)

---

## Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd resume-engine
npm install

# 2. Set your Anthropic API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Start the app
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The SQLite database is created automatically at `data/resume-engine.db` on first run.

---

## First-time setup (in the app)

**1. Experience Bank** — paste your full career history in free-form text. Be thorough: titles, companies, dates, accomplishments, metrics, skills. Claude uses this as the raw material for every tailored resume.

**2. Default Resume** — click "Generate Default Resume". This creates a baseline ATS-safe resume from your bank that gets refined per-role.

**3. Tailor** — paste any job description and click Tailor. The three-step pipeline runs in the background:
- Step 1: Fit assessment (scores your background against the JD)
- Step 2: Resume tailoring (rewrites the resume for that role)
- Step 3: Match evaluation (blind review of the tailored resume)

**4. Scout** (optional) — go to Scout → Settings, add your Exa API key, then click "Run Scout Now". Configure searches in the Searches tab. High-scoring listings can be promoted to the Tailor tab with one click.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `SERVER_PORT` | No | `3001` | Port for the Express API server |

The Exa API key is stored in the app's local database via Scout → Settings (not in `.env`).

---

## Production build

```bash
npm run build   # builds the React frontend into dist/
npm start       # serves both API and static files on SERVER_PORT
```

---

## Tech stack

- **Backend**: Node.js + Express, SQLite (`better-sqlite3`), SSE for live updates
- **Frontend**: React + Vite + Tailwind CSS
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk`
- **Job search**: [Exa](https://exa.ai) semantic search API
- **Queue**: `p-queue` with concurrency 5, exponential backoff on rate limits
- **Export**: `.docx` resume export via `docx` package (ATS-safe formatting)
