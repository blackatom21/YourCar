-- Reminder details (category, part/fluid spec, notes) and per-vehicle specs.
--
-- All additions are nullable or defaulted, so code deployed before this
-- migration keeps working against the new schema.

alter table public.reminders
  add column category text check (char_length(category) <= 40),
  add column part_spec text check (char_length(part_spec) <= 300),
  add column notes text check (char_length(notes) <= 2000);

-- Specs are a short ordered list of label/value pairs ("Rear axle" → "3.55
-- e-locker"). They live on the vehicle row so they inherit its RLS policies.
alter table public.vehicles
  add column specs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(specs) = 'array' and jsonb_array_length(specs) <= 100);

-- reminder_status selects r.*, which Postgres expands when the view is
-- created, so it must be rebuilt to expose the new reminder columns.
-- Definition is otherwise unchanged from 20261003000100_core_schema.sql.
drop view public.reminder_status;

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
