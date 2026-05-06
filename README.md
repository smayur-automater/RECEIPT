# SnapClaim AU 🧾

**AI-powered receipt → tax deduction tracker for Australian freelancers and sole traders.**

Snap a receipt → Claude reads it → instant ATO deduction estimate. Auto-categorised, dashboard-ready, CSV-exportable.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| AI / OCR | Anthropic Claude (`claude-sonnet-4`) |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Charts | Recharts |
| Hosting | Vercel |

---

## Quick start (local)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `NEXT_PUBLIC_SUPABASE_URL` — from your Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project settings

### 3. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. This creates: `receipts`, `tax_profiles`, `audit_log` tables with RLS enabled

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel (recommended)

### Option A: One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard:
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel
# Follow prompts, then:
vercel env add ANTHROPIC_API_KEY
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

---

## Project structure

```
snapclaim/
├── app/
│   ├── api/
│   │   ├── scan-receipt/route.ts   # Claude OCR endpoint
│   │   ├── receipts/route.ts       # CRUD for receipts
│   │   └── export-csv/route.ts     # ATO-ready CSV export
│   ├── layout.tsx
│   ├── page.tsx                    # Main app shell
│   └── globals.css
├── components/
│   ├── SnapTab.tsx                 # Upload + AI scan UI
│   ├── ReceiptsTab.tsx             # Receipt log
│   ├── DashboardTab.tsx            # Stats + charts
│   └── SettingsTab.tsx             # Tax profile + config
├── lib/
│   ├── tax.ts                      # ATO categories, deduction calc
│   └── supabase.ts                 # Supabase client
├── types/
│   └── index.ts                    # TypeScript interfaces
├── supabase/
│   └── schema.sql                  # Database schema + RLS
├── .env.example
└── README.md
```

---

## ATO categories supported

| Category | Deductible % | ATO Rule |
|----------|-------------|----------|
| Work from home | 80% | 67c/hr fixed rate or actual expenses |
| Vehicle & travel | 90% | Cents-per-km (88c/km, up to 5,000km) |
| Tools & equipment | 100% | Immediate write-off under $300 |
| Clothing & uniform | 85% | Distinctive/protective only |
| Self-education | 75% | Must relate to current job |
| Phone & internet | 50% | 4-week diary required |
| Meals & entertainment | 50% | Overnight travel only |
| Professional services | 90% | Accountant, legal fees |
| Home office | 67% | Area-based method |
| Other | 80% | General deductions |

---

## Commercialisation notes

### Monetisation ideas
- **Freemium**: free up to 10 receipts/month, $9/month for unlimited
- **Annual tax report**: $29/year for PDF + accountant-ready export
- **Accountant plan**: white-label for tax agents managing multiple clients
- **Stripe integration**: add billing at `app/api/billing/` with Stripe Checkout

### Compliance
- All deduction rules are based on ATO FY2024–25 guidelines
- Receipt data should be retained for **5 years** (enforced via `audit_log` append-only table)
- This app is a **guide only** — users should consult a registered tax agent for large claims

### Scaling checklist
- [ ] Add Supabase Auth (email/password or magic link)
- [ ] Add Redis (Upstash) for OCR result caching
- [ ] Add Stripe for subscription billing
- [ ] Add push notifications (Vercel Cron) for monthly claim reminders
- [ ] Add pgvector for semantic search across receipt notes
- [ ] Mobile app: Expo + React Native wrapping the same API

---

## License

MIT — build whatever you like on top of this.
