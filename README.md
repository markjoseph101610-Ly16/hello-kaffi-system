# Hello Kaffi System

One GitHub repo, two deployments:
- **Vercel** = frontend (the `public/` pages). The API folder is skipped via `.vercelignore`.
- **Render** = backend (`api/index.js`, run with `npm start`; it also serves the pages).

```
public/        pages (customer site, /pos/ admin + cashier), config.js = API address
api/index.js   Express backend
scripts/       one-time data migration helper
.env.example   template of every variable (copy values into Render, never commit .env)
```

## 1. GitHub
Create a new empty repo, upload everything in this folder (`.env` is git-ignored; never upload it).

## 2. Firebase (project hello-kaffi-hybrid)
- Authentication > Settings > **Authorized domains**: add `YOUR-SERVICE.onrender.com` and `YOUR-APP.vercel.app` (domain only).
- Project settings > Service accounts > **Generate new private key** -> keep the JSON for step 3.

## 3. Render (backend)
New > Web Service > pick the repo. Runtime Node, Build `npm install`, Start `npm start`.
Environment variables (see `.env.example`):
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SESSION_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER`,
`FIREBASE_SERVICE_ACCOUNT` (whole JSON, one line), `ALLOWED_ORIGINS` (your Vercel URL, no trailing slash).
Check `https://YOUR-SERVICE.onrender.com/healthz` -> `"firebaseAdmin":true`.

## 4. Vercel (frontend)
Add New > Project > pick the repo. Framework: Other, no build command (set by `vercel.json`).
Open `public/config.js` and set `RENDER_API` to your Render URL (before pushing).

## Local test
`npm install`, copy `.env.example` to `.env` and fill it, `npm start`, open http://localhost:3000
