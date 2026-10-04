-- Atomically create or update a job together with its parts and videos.
--
-- SECURITY INVOKER: runs as the calling user, so RLS and the composite
-- (parent_id, user_id) foreign keys apply exactly as for direct table writes.
-- Parts and videos are replaced wholesale; photos are managed separately
-- because they are uploaded from the browser straight to Storage.

create or replace function public.save_job(job jsonb, parts jsonb default '[]', videos jsonb default '[]')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job_id uuid := nullif(job ->> 'id', '')::uuid;
begin
  if v_job_id is null then
    insert into public.jobs (
      vehicle_id, type, title, performed_on, mileage, description,
      labor_minutes, total_cost_is_manual, total_cost_cents, reminder_id
    ) values (
      (job ->> 'vehicle_id')::uuid,
      (job ->> 'type')::public.job_type,
      job ->> 'title',
      coalesce((job ->> 'performed_on')::date, current_date),
      (job ->> 'mileage')::integer,
      job ->> 'description',
      (job ->> 'labor_minutes')::integer,
      coalesce((job ->> 'total_cost_is_manual')::boolean, false),
      coalesce((job ->> 'total_cost_cents')::bigint, 0),
      nullif(job ->> 'reminder_id', '')::uuid
    )
    returning id into v_job_id;
  else
    update public.jobs set
      type = (job ->> 'type')::public.job_type,
      title = job ->> 'title',
      performed_on = coalesce((job ->> 'performed_on')::date, performed_on),
      mileage = (job ->> 'mileage')::integer,
      description = job ->> 'description',
      labor_minutes = (job ->> 'labor_minutes')::integer,
      total_cost_is_manual = coalesce((job ->> 'total_cost_is_manual')::boolean, false),
      total_cost_cents = coalesce((job ->> 'total_cost_cents')::bigint, 0),
      reminder_id = nullif(job ->> 'reminder_id', '')::uuid
    where id = v_job_id;

    if not found then
      raise exception 'job not found' using errcode = 'P0002';
    end if;

    delete from public.job_parts p where p.job_id = v_job_id;
    delete from public.job_videos v where v.job_id = v_job_id;
  end if;

  insert into public.job_parts (job_id, name, part_number, quantity, unit_cost_cents, sort_order)
  select v_job_id, x.name, nullif(x.part_number, ''), coalesce(x.quantity, 1),
         coalesce(x.unit_cost_cents, 0), (x.ord - 1)::smallint
    from rows from (
           jsonb_to_recordset(coalesce(parts, '[]'))
             as (name text, part_number text, quantity numeric, unit_cost_cents bigint)
         ) with ordinality as x(name, part_number, quantity, unit_cost_cents, ord);

  insert into public.job_videos (job_id, youtube_video_id, start_seconds, original_url, title, sort_order)
  select v_job_id, x.youtube_video_id, x.start_seconds, x.original_url, nullif(x.title, ''),
         (x.ord - 1)::smallint
    from rows from (
           jsonb_to_recordset(coalesce(videos, '[]'))
             as (youtube_video_id text, start_seconds integer, original_url text, title text)
         ) with ordinality as x(youtube_video_id, start_seconds, original_url, title, ord);

  return v_job_id;
end;
$$;

revoke execute on function public.save_job(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_job(jsonb, jsonb, jsonb) to authenticated;
