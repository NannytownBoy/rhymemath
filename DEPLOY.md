# RhymeMath — Deploy to Vercel + rhymemath.com

## Prerequisites
- Node.js 20+
- A GitHub account
- A Vercel account (free tier works)
- rhymemath.com already registered (point DNS at Vercel)

---

## 1. Run Locally First

```bash
npm install
npm run db:push      # creates rhymemath.db
npm run dev          # http://localhost:5000
```

---

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "RhymeMath MVP"
git remote add origin https://github.com/YOUR_USERNAME/rhymemath.git
git push -u origin main
```

---

## 3. Import into Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select your `rhymemath` repo
4. In **Build & Output Settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist/public`
   - Install Command: `npm install`
5. Click **Deploy**

Vercel auto-detects the `vercel.json` and routes all traffic through the Express server.

---

## 4. Connect rhymemath.com

### In Vercel:
1. Go to your project → **Settings → Domains**
2. Click **Add Domain**
3. Type `rhymemath.com` → Add
4. Also add `www.rhymemath.com` → Add
5. Vercel shows you the DNS records to set

### At your domain registrar (wherever you bought rhymemath.com):
Set these DNS records:

| Type  | Name | Value                  |
|-------|------|------------------------|
| A     | @    | 76.76.21.21            |
| CNAME | www  | cname.vercel-dns.com   |

DNS propagation: 5–30 minutes typically.

---

## 5. Verify

- https://rhymemath.com — should load the comparison form
- https://rhymemath.com/api/rappers — should return JSON
- Test a comparison → should generate a shareable URL like `https://rhymemath.com/#/results/UUID`

---

## Notes

- **Database**: The MVP uses SQLite (`rhymemath.db`). Vercel's filesystem is ephemeral — comparisons reset on each deploy. To persist data across deploys, add Supabase (ask for the upgrade when ready).
- **No login required** — the app is fully public
- **Scoring engine** lives in `server/scoring/scoreComparison.ts` — fully replaceable with an AI model later
