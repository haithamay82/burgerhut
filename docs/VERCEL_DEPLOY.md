# Vercel deployment — Burger Hut (`burgerhut.co.il`)

Production-safe notes: **never** commit `.env.local`, API keys, or PassP. Use **Vercel → Project → Settings → Environment Variables** and reference values only via `process.env` in **server** code (API routes, `getServerSideProps`, etc.). Client bundles only see variables prefixed with `NEXT_PUBLIC_`.

---

## 1. Git status (verified pattern)

```bash
git status
git remote -v
```

Expected: branch `main`, remote `origin` pointing at your GitHub repo (e.g. `https://github.com/<user>/burgerhut.git`).

If Git is not initialized:

```bash
cd /path/to/BurgerHut
git init
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/<YOUR_REPO>.git
```

---

## 2. Connect GitHub → Vercel

1. [Vercel Dashboard](https://vercel.com) → **Add New** → **Project**.
2. **Import** the GitHub repository (install the GitHub app for the org/user if prompted).
3. **Root directory**: repository root (where `package.json` lives).
4. **Framework Preset**: Next.js (auto-detected).
5. **Production Branch**: set to **`main`** (Settings → Git → Production Branch).
6. Save — every **`git push origin main`** triggers a **Production** deployment.

Preview deployments: pushes to other branches / pull requests get preview URLs automatically.

---

## 3. Custom domain (`burgerhut.co.il`)

Vercel → Project → **Settings** → **Domains** → add `burgerhut.co.il` and `www.burgerhut.co.il` (optional).  
At your DNS registrar, set the records Vercel shows (usually **A** / **CNAME** to Vercel).

---

## 4. Environment variables (secure)

Add in **Vercel → Settings → Environment Variables** for **Production** (and Preview if needed):

| Name | Server / client | Notes |
|------|-----------------|--------|
| `HYP_API_KEY` | Server only | Hyp Pay API KEY — **do not** use `NEXT_PUBLIC_` |
| `HYP_TERMINAL` | Server only | Masof |
| `HYP_PASSP` or `HYP_MERCHANT` | Server only | PassP (see `.env.example`) |
| `ADMIN_ORDERS_SECRET` | Server only | Admin API |
| `NEXT_PUBLIC_SITE_URL` | Exposed to browser | **Only** public site URL, e.g. `https://burgerhut.co.il` |

Optional (server): `HYP_PAY_BASE`, `GOOGLE_GEOCODING_API_KEY`, WhatsApp vars, etc. — see `.env.example`.

**Rules:**

- Do **not** log `process.env.HYP_*` values in production (this repo avoids Hyp debug logs on Vercel production).
- Do **not** prefix secrets with `NEXT_PUBLIC_`.
- After changing env vars: **Redeploy** (Deployments → … → Redeploy) so new values apply.

---

## 5. Day-to-day workflow

```bash
# work locally
npm run dev

# ship to production (auto-deploy on Vercel after push)
git add -A
git commit -m "Describe change"
git push origin main
```

Vercel builds install dependencies from `package-lock.json` / `package.json`, runs `next build`, and deploys.

---

## 6. Manual deploy (optional, Vercel CLI)

```bash
npm i -g vercel
vercel login
cd /path/to/BurgerHut
vercel link          # once, link to the Vercel project
vercel deploy --prod
```

Or use the npm script (uses `npx`):

```bash
npm run vercel:prod
```

CLI deploy does **not** replace Git-based deploys; use Git as the source of truth for `main`.

---

## 7. Redeploy without new commit

- **Dashboard**: Project → **Deployments** → latest production deployment → **⋯** → **Redeploy**.
- Or push an empty commit: `git commit --allow-empty -m "chore: redeploy" && git push origin main`.

---

## 8. Troubleshooting

- **Build fails**: check Vercel build logs; run `npm run build` locally.
- **Payments / API 503**: verify Production env vars match `.env.example` names (no typos).
- **Wrong domain on redirects**: set `NEXT_PUBLIC_SITE_URL=https://burgerhut.co.il` in Vercel.
