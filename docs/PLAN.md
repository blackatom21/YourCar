# Garage Log — Approved Plan

Approved 2026-10-03 with all recommendations accepted.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Background jobs | **Inngest** (step functions on Vercel, ~25 pages per step) |
| 2 | OCR for scanned pages | **Claude Haiku 4.5 vision** (`claude-haiku-4-5`) |
| 3 | Answer model | **Claude Opus 5.5** (`claude-opus-5-5`), env-configurable (`ANSWER_MODEL`) |
| 4 | General-knowledge fallback | **None in v1** — "Not found in your manuals" only |
| 5 | Supabase plan | **Pro** (manual PDFs often exceed the free tier's 50 MB/file limit) |
| 6 | Deploy | User creates Supabase project + API keys; Claude may create/link the Vercel project |
| 7 | Defaults | Distance unit per profile (mi/km); total cost = sum of parts, overridable; labor stored as minutes; "due soon" = within 500 mi or 30 days |

## Architecture

- **Next.js 16 (App Router, TS)** on Vercel. Server Components for reads, Server Actions for writes, `@supabase/ssr` for cookie auth, `proxy.ts` refreshes the session.
- **Supabase**: Postgres + Auth + Storage + pgvector. RLS on every table and bucket.
- **Uploads** go directly browser → Supabase Storage (resumable/TUS for manuals) — never through Vercel functions (4.5 MB body limit).
- **Embeddings**: Voyage (`voyage-3.5` or `voyage-context-3`, 1024 dims) + Voyage rerank. Verify current names/prices at Phase 2.
- **Retrieval**: hybrid — pgvector + Postgres full-text, merged with reciprocal-rank fusion, then reranked.
- **Answers**: Claude with native citations (each chunk = one document block). Server validates citations map to retrieved chunks; numeric specs must appear verbatim in cited text.
- **PDF viewer**: in-app pdf.js (iOS Safari ignores `#page=N`).

## Data model

Every user-owned table has `user_id` and four RLS policies (`user_id = (select auth.uid())`).
Child tables use composite FKs `(parent_id, user_id) → parent(id, user_id)` so a row can never point at another user's parent.

Phase 1: `profiles`, `vehicles`, `jobs`, `job_parts`, `job_photos`, `job_videos`, `reminders` (+ `reminder_status` view).
Phase 2: `manuals`, `manual_pages`, `manual_chunks`, `job_manual_refs`, `qa_questions`, `usage_events`.

Storage buckets (private, path prefix `{user_id}/`): `vehicle-photos`, `job-photos`, `manuals`.

Copyright guardrail: no cross-user dedup of manuals, ever. Worker (service role) always scopes by the manual's `user_id`.

## Phases

- **1a** Scaffold, CI, local Supabase, auth, Phase 1 schema + RLS + storage policies, RLS tests.
- **1b** Vehicles, jobs (parts, camera photos, YouTube embeds).
- **1c** Timeline + type filter, reminders, deploy. **Stop for approval.**
- **2a** Manual upload + Inngest ingestion (extract, classify, OCR, headings, chunk, embed) with status.
- **2b** Hybrid retrieval, cited answers, validation, in-app viewer.
- **2c** Job ↔ manual refs, cost tracking UI, eval script, README, limitations. **Stop for approval.**
