# Garage Log

Track everything about your vehicles: maintenance, upgrades, repairs, parts, photos,
how-to videos, and your workshop manuals — with AI answers that cite the manual page
and say "not found" rather than guess.

Multi-user from day one: every row and every stored file is private to its owner,
enforced by Postgres row-level security and covered by automated tests.

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture and phase plan.

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, pgvector) ·
Tailwind CSS 4 · Inngest (background jobs) · Claude (answers, OCR) · Voyage AI
(embeddings, reranking) · Vitest + Playwright.

## How manual Q&A works

1. **Upload** — the browser uploads the PDF straight to private Supabase Storage (resumable).
2. **Ingest** (background, Inngest steps) — text layer per page; pages with no text are
   OCR'd with Claude Haiku; running headers stripped; headings detected; section-aware
   chunks that remember their page(s); Voyage embeddings + Postgres full-text index.
3. **Ask** — hybrid search (vector + keyword) over that vehicle's manuals, Voyage rerank,
   then Claude answers using only those excerpts as citable `search_result` blocks.
4. **Guardrails** — an answer is shown only if it cites the manual; otherwise "Not found
   in your manuals". Numbers in the answer are checked against the cited text and
   flagged if they don't match. Every citation links to the page in an in-app PDF viewer.
5. **Cost** — every OCR/embedding/rerank/answer call is logged with tokens and estimated
   cost (`/usage`).

## Run locally

Requirements: Node 20.9+ and Docker (for the local Supabase stack).

```bash
npm install
npm run db:start          # starts Postgres/Auth/Storage in Docker and applies migrations
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from `npx supabase status`
npm run dev               # http://localhost:3000
```

Local email confirmation is disabled, so sign-up logs you straight in.

**Manuals locally:** add `SUPABASE_SERVICE_ROLE_KEY` (from `npx supabase status`) to
`.env.local`. Then either add real `ANTHROPIC_API_KEY` + `VOYAGE_API_KEY`, or set
`RAG_PROVIDERS=fake` to run the whole pipeline with deterministic stand-ins (no cost,
crude answers). Without Inngest configured, manuals are processed in-process after upload.

> If Docker can't pull from `public.ecr.aws` on your network, prefix Supabase commands with
> `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`.

## Tests

```bash
npm test          # unit tests (no database)
npm run test:db   # data-isolation (RLS) + database tests; needs `npm run db:start`
npm run test:all  # both
npm run test:e2e  # Playwright, phone viewport; builds and starts the app on :3100
npm run lint && npm run typecheck
```

The RLS suite creates two real users and checks, for every table and bucket, that user B
and anonymous visitors cannot read, update, delete, take ownership of, or attach rows to
user A's data — with a positive control for each check.

## Database

Migrations live in `supabase/migrations/`. After changing the schema:

```bash
npx supabase migration new <name>   # write SQL in the new file
npm run db:reset                    # re-apply everything locally
npm run db:types                    # regenerate lib/database.types.ts (CI checks this)
```

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | client + server | Public key (RLS protects data); publishable key preferred |
| `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) | server only | Ingestion worker, Q&A and cost records. Never expose. Secret key preferred. |
| `ANTHROPIC_API_KEY` | server only | Answers (Claude Opus 5.5) and OCR (Claude Haiku 4.5) |
| `VOYAGE_API_KEY` | server only | Embeddings and reranking |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | server only | Background ingestion in production |

Optional overrides (models, thresholds, local modes) are documented in `.env.example`.

## Deploying (Vercel + Supabase)

1. **Create a Supabase project** (Pro plan recommended — see `docs/PLAN.md`, decision 5).
2. **Apply migrations:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Auth settings** (Supabase dashboard → Authentication → URL Configuration):
   set *Site URL* to your Vercel URL and add `https://<your-domain>/auth/confirm` to *Redirect URLs*.
   Email confirmation is on by default in hosted projects; sign-up sends a link that lands on `/auth/confirm`.
   The built-in email sender is rate-limited — configure custom SMTP before inviting other users.
4. **Storage upload limit:** Supabase dashboard → Storage → Settings → set the global
   file size limit to at least 500 MB (the `manuals` bucket allows 500 MB; the global limit
   wins if lower — the free plan caps it at 50 MB).
5. **Create the Vercel project** from this repo and set the environment variables above for
   Production and Preview.
6. **Inngest:** install the Inngest integration from the Vercel marketplace (it sets the
   keys), or create an app at inngest.com and set the two keys yourself. After deploying,
   sync the app URL `https://<your-domain>/api/inngest` in the Inngest dashboard.
7. Deploy. Upload a manual and watch its status go Queued → Processing → Ready.

## Known limitations

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).
