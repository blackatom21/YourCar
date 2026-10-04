-- Garage Log — row-level security and storage policies.
--
-- Rule: a signed-in user can only ever see or change rows they own.
-- The anon role gets no table access at all (defence in depth on top of RLS).

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Trigger helpers are not meant to be called directly.
revoke execute on function public.handle_new_user() from public, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: one row per user, keyed by id. Created by trigger, never deleted
-- directly (it goes away with the auth user).
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only policies for every user_id-keyed table.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'vehicles', 'reminders', 'jobs', 'job_parts', 'job_photos', 'job_videos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select to authenticated
         using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated
         with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated
         using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, every object path starts with the owner's user id.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicle-photos', 'vehicle-photos', false, 15 * 1024 * 1024,
     array['image/jpeg', 'image/png', 'image/webp']),
  ('job-photos', 'job-photos', false, 15 * 1024 * 1024,
     array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "garage buckets: owner can read"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('vehicle-photos', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "garage buckets: owner can upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('vehicle-photos', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "garage buckets: owner can update"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('vehicle-photos', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id in ('vehicle-photos', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "garage buckets: owner can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('vehicle-photos', 'job-photos')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
