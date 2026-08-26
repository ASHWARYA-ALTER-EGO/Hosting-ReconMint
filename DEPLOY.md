# Deployment (optional — not required for judging)

The Buildathon is judged on the repo + the 5-minute video, so a live deploy is a **nice-to-have**,
not a requirement. Record the video against localhost. This file pre-wires the deploy path so you
can flip it on late (Day 11) without scrambling.

## Architecture (Railway — two services)

| Service | Root directory | Config | Public URL |
|---------|----------------|--------|------------|
| **Backend** (FastAPI) | repo root | `railway.json` + root `Dockerfile` | e.g. `https://reconmint-api.up.railway.app` |
| **Frontend** (React) | `frontend/` | `frontend/railway.json` + `frontend/Dockerfile` | e.g. `https://reconmint.up.railway.app` |

The frontend nginx container **proxies** `/reconcile`, `/health`, `/runs/*`, etc. to the backend, so
the browser never POSTs to a static file server (which causes **HTTP 405**).

## Backend on Railway

1. New service → connect GitHub repo → **Root Directory: `/`** (repo root).
2. Railway uses root `Dockerfile` / `railway.json` (healthcheck `/health`).
3. Set env vars:
   - `OPENAI_API_KEY` (optional — demo works without LLM)
   - `RECONMINT_CORS_ORIGINS=https://your-frontend.up.railway.app` (comma-separate multiple origins)
4. Deploy and copy the public URL (no trailing slash).

## Frontend on Railway

1. New service → same repo → **Root Directory: `frontend`**.
2. Railway uses `frontend/Dockerfile` / `frontend/railway.json`.
3. Set env var:
   - **`BACKEND_URL`** = your backend public URL, e.g. `https://reconmint-api.up.railway.app`
4. Redeploy.

Do **not** point `VITE_API_BASE_URL` at the frontend URL — that sends POST requests to the static
server and returns 405.

### Alternative: Cloudflare Pages (frontend only)

1. Build command: `npm run build` | Output: `dist` | Root: `frontend`
2. Build env: `VITE_API_BASE_URL = <railway backend url>`
3. Set `RECONMINT_CORS_ORIGINS` on the backend to your `*.pages.dev` origin.

## Verify after deploy

```bash
# Backend
curl https://YOUR-BACKEND.up.railway.app/health

# Demo reconcile (must return 200 JSON, not 405)
curl -X POST https://YOUR-BACKEND.up.railway.app/reconcile/demo

# Through frontend proxy (same POST via nginx)
curl -X POST https://YOUR-FRONTEND.up.railway.app/reconcile/demo
```

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
