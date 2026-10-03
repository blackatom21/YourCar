# Garage Log

Track everything about your vehicles: maintenance, upgrades, repairs, parts, photos,
how-to videos, and (Phase 2) workshop manuals with cited AI answers.

Multi-user from day one: every row and every stored file is private to its owner,
enforced by Postgres row-level security and covered by automated tests.

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture and phase plan.

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, pgvector) ·
Tailwind CSS 4 · Vitest. Phase 2 adds Inngest, Claude, and Voyage AI.

## Run locally

Requirements: Node 20.9+ and Docker (for the local Supabase stack).

```bash
npm install
npm run db:start          # starts Postgres/Auth/Storage in Docker and applies migrations
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_ANON_KEY from `npx supabase status`
npm run dev               # http://localhost:3000
```

Local email confirmation is disabled, so sign-up logs you straight in.

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Phase 2 ingestion worker. Never expose. |

Phase 2 keys (`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, Inngest keys) are listed in `.env.example`.

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
4. **Create the Vercel project** from this repo and set the environment variables above
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for Production and Preview.
5. Deploy. Vercel builds with `next build`; no extra configuration is needed.

## Known limitations

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).
