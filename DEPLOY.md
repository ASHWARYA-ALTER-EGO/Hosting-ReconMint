# Deployment (optional — not required for judging)

The Buildathon is judged on the repo + the 5-minute video, so a live deploy is a **nice-to-have**,
not a requirement. Record the video against localhost. This file pre-wires the deploy path so you
can flip it on late (Day 11) without scrambling.

## Architecture
- **Backend (FastAPI + engine)** -> Railway
- **Frontend (React dashboard)** -> Cloudflare Pages
- Frontend calls the backend via `VITE_API_BASE_URL` (set to the Railway URL at deploy time).

## Backend on Railway
Already scaffolded:
- `Procfile` -> `web: uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT`
- `railway.json` -> NIXPACKS build + start command
- `runtime.txt` -> pins Python 3.11.9
- `requirements.txt` -> deps

Steps (when the API exists, Day 8+):
1. Push repo to GitHub (you commit manually — assistant never commits).
2. Railway -> New Project -> Deploy from GitHub repo.
3. Set env vars in Railway: `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
4. Railway auto-detects `railway.json`; deploy. Note the public URL.
5. CORS: `backend/api/main.py` must allow the Cloudflare Pages origin.

> Note: `backend/api/main.py` does not exist until Day 8. Until then the start command has nothing
> to serve — that is expected. The config is intentionally pre-staged.

## Frontend on Cloudflare Pages
Wired on Day 8 when `frontend/` is created (Vite + React):
1. Cloudflare Pages -> Create project -> connect the GitHub repo.
2. Build command: `npm run build`   |   Output dir: `dist`   |   Root: `frontend`.
3. Env var: `VITE_API_BASE_URL = <railway backend url>`.
4. Deploy; Cloudflare gives a `*.pages.dev` URL.

## Data / persistence note
Reconciliation runs are stateless per upload. The SQLite audit log path is env-configurable via
`RECONMINT_DB` (defaults to `data/audit.db`). On Railway:
- For the demo, the ephemeral default is fine (audit log resets on redeploy).
- For persistence, add a Railway Volume (e.g. mounted at `/data`) and set
  `RECONMINT_DB=/data/audit.db`. No managed DB server needed. If you ever outgrow SQLite, the
  writer in `backend/agent/audit.py` is the single place to swap in Postgres.

## Secrets
Never commit `.env`. All keys live only in Railway/Cloudflare env settings and your local `.env`
(gitignored).
