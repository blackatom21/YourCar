-- Garage Log — Phase 2: workshop manuals, retrieval, Q&A history, usage/cost tracking.
--
-- Copyright guardrail: manuals are private to the uploader. There is no shared
-- or deduplicated storage across users, and every derived row (pages, chunks,
-- answers) carries the owner's user_id and is readable only by them.
--
-- Write model:
--   * Users create manual rows (limited columns), rename/move/delete them, and
--     manage job ↔ manual references.
--   * Derived data (pages, chunks, embeddings, status, Q&A records, usage/cost
--     events) is written only by the server with the service role, so a user
--     can never forge processing status or cost records.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Manuals
-- ---------------------------------------------------------------------------

create type public.manual_status as enum ('uploading', 'queued', 'processing', 'ready', 'failed');

create table public.manuals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  original_filename text check (char_length(original_filename) <= 300),
  storage_path text not null unique,
  size_bytes bigint check (size_bytes > 0),
  page_count integer check (page_count >= 0),
  status public.manual_status not null default 'uploading',
  stage text,
  pages_done integer not null default 0,
  ocr_pages integer not null default 0,
  chunk_count integer not null default 0,
  error text,
  ingest_cost_usd numeric(12, 6) not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  check (storage_path = user_id::text || '/' || id::text || '.pdf')
);

create index manuals_user_id_idx on public.manuals (user_id);
create index manuals_vehicle_id_idx on public.manuals (vehicle_id);

create trigger manuals_updated_at before update on public.manuals
  for each row execute function public.set_updated_at();

-- One row per PDF page: extracted (or OCR'd) text plus structural blocks
-- (headings, paragraphs, tables) used by the chunker.
create table public.manual_pages (
  manual_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  source text not null check (source in ('text_layer', 'ocr', 'empty')),
  text text not null default '',
  blocks jsonb not null default '[]',
  char_count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (manual_id, page_number),
  foreign key (manual_id, user_id) references public.manuals (id, user_id) on delete cascade
);

create index manual_pages_user_id_idx on public.manual_pages (user_id);

-- Retrieval units. `segments` keeps the chunk's text split by page so every
-- citation maps back to an exact page.
create table public.manual_chunks (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null,
  chunk_index integer not null,
  page_start integer not null check (page_start >= 1),
  page_end integer not null check (page_end >= page_start),
  section_path text,
  content text not null,
  segments jsonb not null,
  token_count integer,
  embedding extensions.vector(1024),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(section_path, '') || ' ' || content)
  ) stored,
  created_at timestamptz not null default now(),
  unique (manual_id, chunk_index),
  foreign key (manual_id, user_id) references public.manuals (id, user_id) on delete cascade
);

-- Retrieval is always scoped to one vehicle, whose chunk count is in the
-- thousands, so we use exact (sequential) vector distance over that vehicle's
-- rows rather than an ANN index. This is both correct under RLS (an HNSW scan
-- filtered afterwards by owner can silently return nothing) and fast at this
-- scale. Revisit with pgvector iterative scans if per-vehicle volume grows.
create index manual_chunks_vehicle_idx on public.manual_chunks (vehicle_id, user_id);
create index manual_chunks_manual_idx on public.manual_chunks (manual_id);
create index manual_chunks_fts_idx on public.manual_chunks using gin (fts);

-- ---------------------------------------------------------------------------
-- Job ↔ manual page references
-- ---------------------------------------------------------------------------

create table public.job_manual_refs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  manual_id uuid not null,
  page integer not null check (page >= 1),
  label text check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  foreign key (manual_id, user_id) references public.manuals (id, user_id) on delete cascade
);

create index job_manual_refs_job_idx on public.job_manual_refs (job_id);
create index job_manual_refs_user_idx on public.job_manual_refs (user_id);

-- ---------------------------------------------------------------------------
-- Q&A history and usage/cost events (server-written)
-- ---------------------------------------------------------------------------

create table public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null,
  question text not null check (char_length(question) between 1 and 2000),
  found boolean not null,
  answer text not null,
  citations jsonb not null default '[]',
  warnings jsonb not null default '[]',
  candidates jsonb not null default '[]',
  model text,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade
);

create index qa_questions_vehicle_idx on public.qa_questions (vehicle_id, created_at desc);
create index qa_questions_user_idx on public.qa_questions (user_id);

create type public.usage_kind as enum ('ocr', 'embed_document', 'embed_query', 'rerank', 'answer');

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.usage_kind not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  pages integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  manual_id uuid references public.manuals (id) on delete set null,
  question_id uuid references public.qa_questions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index usage_events_user_idx on public.usage_events (user_id, created_at desc);
create index usage_events_manual_idx on public.usage_events (manual_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.manuals enable row level security;
alter table public.manual_pages enable row level security;
alter table public.manual_chunks enable row level security;
alter table public.job_manual_refs enable row level security;
alter table public.qa_questions enable row level security;
alter table public.usage_events enable row level security;

alter table public.manuals force row level security;
alter table public.manual_pages force row level security;
alter table public.manual_chunks force row level security;
alter table public.job_manual_refs force row level security;
alter table public.qa_questions force row level security;
alter table public.usage_events force row level security;

revoke all on public.manuals, public.manual_pages, public.manual_chunks, public.job_manual_refs,
  public.qa_questions, public.usage_events from anon, authenticated;

-- Read access: owner only, everywhere.
create policy "manuals: owner can read" on public.manuals for select to authenticated
  using (user_id = (select auth.uid()));
create policy "manual_pages: owner can read" on public.manual_pages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "manual_chunks: owner can read" on public.manual_chunks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "qa_questions: owner can read" on public.qa_questions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "usage_events: owner can read" on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.manuals, public.manual_pages, public.manual_chunks,
  public.qa_questions, public.usage_events to authenticated;

-- Manuals: users may create a row in the 'uploading' state, rename/move it, and delete it.
create policy "manuals: owner can insert" on public.manuals for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "manuals: owner can update" on public.manuals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "manuals: owner can delete" on public.manuals for delete to authenticated
  using (user_id = (select auth.uid()));

grant insert (id, vehicle_id, title, original_filename, storage_path, size_bytes) on public.manuals to authenticated;
grant update (title, vehicle_id) on public.manuals to authenticated;
grant delete on public.manuals to authenticated;

-- Users can delete their own Q&A history.
create policy "qa_questions: owner can delete" on public.qa_questions for delete to authenticated
  using (user_id = (select auth.uid()));
grant delete on public.qa_questions to authenticated;

-- Job ↔ manual references: full owner CRUD.
create policy "job_manual_refs: owner can read" on public.job_manual_refs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "job_manual_refs: owner can insert" on public.job_manual_refs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "job_manual_refs: owner can update" on public.job_manual_refs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "job_manual_refs: owner can delete" on public.job_manual_refs for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.job_manual_refs to authenticated;

-- ---------------------------------------------------------------------------
-- Hybrid search (vector + full-text, reciprocal-rank fusion)
--
-- SECURITY INVOKER: the caller's RLS applies, so a user can only ever search
-- their own chunks, even if they pass someone else's vehicle id.
-- ---------------------------------------------------------------------------

create or replace function public.search_manual_chunks(
  p_vehicle_id uuid,
  p_query_embedding extensions.vector(1024),
  p_query_text text,
  p_limit integer default 40
)
returns table (
  id uuid,
  manual_id uuid,
  manual_title text,
  page_start integer,
  page_end integer,
  section_path text,
  content text,
  segments jsonb,
  vector_rank integer,
  text_rank integer,
  rrf_score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ready_chunks as (
    select c.*
      from public.manual_chunks c
      join public.manuals m on m.id = c.manual_id and m.status = 'ready'
     where c.vehicle_id = p_vehicle_id
       and c.embedding is not null
  ),
  vec as (
    select rc.id,
           row_number() over (order by rc.embedding operator(extensions.<=>) p_query_embedding)::integer as r
      from ready_chunks rc
     order by rc.embedding operator(extensions.<=>) p_query_embedding
     limit p_limit
  ),
  -- OR-semantics keyword query: any meaningful word can match; rank by coverage.
  q as (
    select nullif(replace(plainto_tsquery('english', coalesce(p_query_text, ''))::text, '&', '|'), '')::tsquery as tsq
  ),
  txt as (
    select rc.id,
           row_number() over (order by ts_rank_cd(rc.fts, q.tsq) desc)::integer as r
      from ready_chunks rc, q
     where q.tsq is not null and rc.fts @@ q.tsq
     order by ts_rank_cd(rc.fts, q.tsq) desc
     limit p_limit
  ),
  fused as (
    select coalesce(vec.id, txt.id) as id,
           vec.r as vector_rank,
           txt.r as text_rank,
           coalesce(1.0 / (60 + vec.r), 0) + coalesce(1.0 / (60 + txt.r), 0) as rrf_score
      from vec full outer join txt on txt.id = vec.id
  )
  select c.id, c.manual_id, m.title, c.page_start, c.page_end, c.section_path, c.content, c.segments,
         f.vector_rank, f.text_rank, f.rrf_score
    from fused f
    join public.manual_chunks c on c.id = f.id
    join public.manuals m on m.id = c.manual_id
   order by f.rrf_score desc
   limit p_limit;
$$;

revoke execute on function public.search_manual_chunks(uuid, extensions.vector, text, integer) from public, anon;
grant execute on function public.search_manual_chunks(uuid, extensions.vector, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private 'manuals' bucket, PDFs only, path {user_id}/{manual_id}.pdf
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manuals', 'manuals', false, 524288000, array['application/pdf'])
on conflict (id) do nothing;

create policy "manuals bucket: owner can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'manuals' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- Uploads must target a manual row the user owns that is still 'uploading'.
create policy "manuals bucket: owner can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'manuals'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1 from public.manuals m
       where m.storage_path = name
         and m.user_id = (select auth.uid())
         and m.status = 'uploading'
    )
  );

create policy "manuals bucket: owner can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'manuals' and (storage.foldername(name))[1] = (select auth.uid()::text));
