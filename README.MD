# MetaMeet 2D

A 2D virtual space where avatars walk around (Phaser). When two players come
within proximity they can start a **WebRTC** video call. Real-time movement,
proximity, chat, and signaling run over **Socket.io**.

- `frontend/` — React + Vite + Phaser
- `backend/`  — Node + Express + Socket.io

## Local development

```bash
# Backend  (http://localhost:3000)
cd backend
npm install
npm start

# Frontend (http://localhost:5173)
cd frontend
npm install
cp .env.example .env   # defaults already point at localhost:3000
npm run dev
```

## Environment variables

See `backend/.env.example` and `frontend/.env.example`.

| Var | Side | Purpose |
|-----|------|---------|
| `PORT` | backend | Listen port (Render sets this automatically) |
| `CLIENT_ORIGIN` | backend | Allowed CORS origin(s); `*` for dev |
| `VITE_SOCKET_URL` / `VITE_API_URL` | frontend | Backend URL (inlined at build time) |
| `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | frontend | Optional TURN relay for WebRTC across strict NATs |

> **Important:** Vite inlines `VITE_*` vars at *build* time. Changing them on
> Render requires a frontend rebuild.

## Deploying to Render

You can either import `render.yaml` as a **Blueprint** (does both services at
once) or create the two services manually:

### 1. Backend — Web Service
- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- (Optional) Env var `CLIENT_ORIGIN` = your frontend URL once you have it.
- Copy the resulting URL, e.g. `https://metameet-backend.onrender.com`.

### 2. Frontend — Static Site
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Add a rewrite rule: `/*` → `/index.html` (SPA fallback).
- Env vars (set **before** the build):
  - `VITE_SOCKET_URL` = backend URL from step 1
  - `VITE_API_URL` = backend URL from step 1
  - (optional) `VITE_TURN_*` for reliable video across networks
- Deploy.

### 3. Tighten CORS (optional)
Set the backend's `CLIENT_ORIGIN` to the frontend URL and redeploy the backend.

### Notes
- Render's free tier **spins down after inactivity**; the first request after
  idle takes ~30–60s to wake. The client auto-reconnects and re-joins the room.
- WebRTC needs HTTPS — Render provides it on both services automatically.
- Health check: `GET /health` on the backend returns uptime + room count.
