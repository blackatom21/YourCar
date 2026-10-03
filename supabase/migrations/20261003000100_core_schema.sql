-- Garage Log — Phase 1 core schema.
--
-- Ownership model: every user-owned row carries user_id. Child rows reference
-- their parent by (parent_id, user_id) so Postgres itself guarantees a child can
-- never be attached to another user's parent, independent of RLS.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  distance_unit text not null default 'mi' check (distance_unit in ('mi', 'km')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row automatically for each new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year smallint check (year between 1885 and 2100),
  make text not null check (char_length(make) between 1 and 60),
  model text not null check (char_length(model) between 1 and 60),
  trim text check (char_length(trim) <= 60),
  -- Pre-1981 VINs are shorter than 17 characters, so only cap the length.
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{1,17}$'),
  engine text check (char_length(engine) <= 100),
  current_mileage integer not null default 0 check (current_mileage >= 0),
  purchase_date date,
  notes text check (char_length(notes) <= 10000),
  cover_photo_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (cover_photo_path is null or cover_photo_path like user_id::text || '/%')
);

create index vehicles_user_id_idx on public.vehicles (user_id);

create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reminders (declared before jobs so jobs can reference them)
-- ---------------------------------------------------------------------------

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  interval_miles integer check (interval_miles > 0),
  interval_months smallint check (interval_months > 0),
  last_done_mileage integer check (last_done_mileage >= 0),
  last_done_on date,
  due_soon_miles integer not null default 500 check (due_soon_miles >= 0),
  due_soon_days smallint not null default 30 check (due_soon_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  check (interval_miles is not null or interval_months is not null)
);

create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_vehicle_id_idx on public.reminders (vehicle_id);

create trigger reminders_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

create type public.job_type as enum ('maintenance', 'upgrade', 'repair');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null,
  type public.job_type not null,
  title text not null check (char_length(title) between 1 and 200),
  performed_on date not null default current_date,
  mileage integer check (mileage >= 0),
  description text check (char_length(description) <= 20000),
  labor_minutes integer check (labor_minutes >= 0),
  -- Sum of parts unless the user overrides it (total_cost_is_manual).
  total_cost_cents bigint not null default 0 check (total_cost_cents >= 0),
  total_cost_is_manual boolean not null default false,
  reminder_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  foreign key (reminder_id, user_id) references public.reminders (id, user_id)
    on delete set null (reminder_id)
);

create index jobs_user_id_idx on public.jobs (user_id);
create index jobs_vehicle_timeline_idx on public.jobs (vehicle_id, performed_on desc, created_at desc);
create index jobs_reminder_id_idx on public.jobs (reminder_id);

create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

create table public.job_parts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  part_number text check (char_length(part_number) <= 100),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_cost_cents bigint not null default 0 check (unit_cost_cents >= 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);

create index job_parts_job_id_idx on public.job_parts (job_id);
create index job_parts_user_id_idx on public.job_parts (user_id);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  storage_path text not null unique,
  width integer check (width > 0),
  height integer check (height > 0),
  caption text check (char_length(caption) <= 500),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade,
  check (storage_path like user_id::text || '/%')
);

create index job_photos_job_id_idx on public.job_photos (job_id);
create index job_photos_user_id_idx on public.job_photos (user_id);

create table public.job_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  start_seconds integer check (start_seconds >= 0),
  original_url text not null check (char_length(original_url) <= 500),
  title text check (char_length(title) <= 200),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);

create index job_videos_job_id_idx on public.job_videos (job_id);
create index job_videos_user_id_idx on public.job_videos (user_id);

-- ---------------------------------------------------------------------------
-- Derived data triggers (run with the caller's privileges, so RLS applies)
-- ---------------------------------------------------------------------------

-- Recompute a job's total from its parts unless the user set it manually.
create or replace function public.recompute_job_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_job uuid := coalesce(new.job_id, old.job_id);
begin
  update public.jobs j
     set total_cost_cents = coalesce((
           select round(sum(p.quantity * p.unit_cost_cents))::bigint
             from public.job_parts p
            where p.job_id = target_job), 0)
   where j.id = target_job
     and not j.total_cost_is_manual;
  return null;
end;
$$;

create trigger job_parts_recompute_total
  after insert or update or delete on public.job_parts
  for each row execute function public.recompute_job_total();

-- When a job switches back to automatic totals, recompute immediately.
create or replace function public.job_total_on_mode_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.total_cost_is_manual then
    new.total_cost_cents = coalesce((
      select round(sum(p.quantity * p.unit_cost_cents))::bigint
        from public.job_parts p
       where p.job_id = new.id), 0);
  end if;
  return new;
end;
$$;

create trigger jobs_total_mode before insert or update of total_cost_is_manual, total_cost_cents
  on public.jobs
  for each row execute function public.job_total_on_mode_change();

-- Logging a job with a higher odometer reading bumps the vehicle's mileage, and a
-- job linked to a reminder marks that reminder as done (if this job is newer).
create or replace function public.apply_job_side_effects()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mileage is not null then
    update public.vehicles v
       set current_mileage = new.mileage
     where v.id = new.vehicle_id
       and v.current_mileage < new.mileage;
  end if;

  if new.reminder_id is not null then
    update public.reminders r
       set last_done_on = new.performed_on,
           last_done_mileage = coalesce(new.mileage, r.last_done_mileage)
     where r.id = new.reminder_id
       and (r.last_done_on is null or r.last_done_on <= new.performed_on);
  end if;

  return null;
end;
$$;

create trigger jobs_side_effects
  after insert or update of mileage, reminder_id, performed_on on public.jobs
  for each row execute function public.apply_job_side_effects();

-- ---------------------------------------------------------------------------
-- Reminder status view (security_invoker: the caller's RLS applies)
-- ---------------------------------------------------------------------------

create view public.reminder_status
with (security_invoker = true)
as
select
  r.*,
  v.current_mileage,
  case when r.interval_miles is not null and r.last_done_mileage is not null
       then r.last_done_mileage + r.interval_miles end as next_due_mileage,
  case when r.interval_months is not null and r.last_done_on is not null
       then (r.last_done_on + make_interval(months => r.interval_months))::date end as next_due_on,
  case when r.interval_miles is not null and r.last_done_mileage is not null
       then r.last_done_mileage + r.interval_miles - v.current_mileage end as miles_remaining,
  case when r.interval_months is not null and r.last_done_on is not null
       then (r.last_done_on + make_interval(months => r.interval_months))::date - current_date end as days_remaining,
  case
    when (r.interval_miles is null or r.last_done_mileage is null)
     and (r.interval_months is null or r.last_done_on is null) then 'never_done'
    when (r.interval_miles is not null and r.last_done_mileage is not null
          and r.last_done_mileage + r.interval_miles - v.current_mileage < 0)
      or (r.interval_months is not null and r.last_done_on is not null
          and (r.last_done_on + make_interval(months => r.interval_months))::date < current_date)
      then 'overdue'
    when (r.interval_miles is not null and r.last_done_mileage is not null
          and r.last_done_mileage + r.interval_miles - v.current_mileage <= r.due_soon_miles)
      or (r.interval_months is not null and r.last_done_on is not null
          and (r.last_done_on + make_interval(months => r.interval_months))::date - current_date <= r.due_soon_days)
      then 'due_soon'
    else 'ok'
  end as status
from public.reminders r
join public.vehicles v on v.id = r.vehicle_id and v.user_id = r.user_id;
