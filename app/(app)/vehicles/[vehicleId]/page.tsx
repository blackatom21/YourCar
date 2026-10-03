import Link from "next/link";
import { notFound } from "next/navigation";
import { TypeBadge } from "@/components/jobs/type-badge";
import { ReminderList, type ReminderRow } from "@/components/reminders/reminder-list";
import { buttonClass } from "@/components/ui/button-styles";
import { MileageUpdater } from "@/components/vehicles/mileage-updater";
import { formatDate, formatMileage, formatMoney, vehicleName } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { BUCKETS, signedUrls } from "@/lib/storage";
import { requireUser } from "@/lib/supabase/server";
import { jobTypes, type JobType } from "@/lib/validation";

const STATUS_ORDER = { overdue: 0, due_soon: 1, never_done: 2, ok: 3 } as const;

export default async function VehiclePage({ params, searchParams }: PageProps<"/vehicles/[vehicleId]">) {
  const { vehicleId } = await params;
  const { type } = await searchParams;
  const filter = jobTypes.includes(type as JobType) ? (type as JobType) : null;
  const [{ supabase }, profile] = await Promise.all([requireUser(), getProfile()]);

  let jobsQuery = supabase
    .from("jobs")
    .select("id, type, title, performed_on, mileage, total_cost_cents, job_photos(count)")
    .eq("vehicle_id", vehicleId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter) jobsQuery = jobsQuery.eq("type", filter);

  const [{ data: vehicle }, { data: jobs }, { data: reminders }] = await Promise.all([
    supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle(),
    jobsQuery,
    supabase.from("reminder_status").select("*").eq("vehicle_id", vehicleId).eq("active", true),
  ]);
  if (!vehicle) notFound();

  const coverUrl = (await signedUrls(supabase, BUCKETS.vehicle, [vehicle.cover_photo_path]))[vehicle.cover_photo_path ?? ""];
  const sortedReminders = ((reminders ?? []) as ReminderRow[]).sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title),
  );

  // Group the timeline by year for scannability.
  const byYear = new Map<string, NonNullable<typeof jobs>>();
  for (const job of jobs ?? []) {
    const year = job.performed_on.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), job]);
  }
  const totalSpent = (jobs ?? []).reduce((s, j) => s + j.total_cost_cents, 0);

  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-4 text-sm font-medium flex items-center capitalize ${
      active ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
    }`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={coverUrl} alt="" className="aspect-[16/9] w-full rounded-xl object-cover" />
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{vehicleName(vehicle)}</h1>
            {vehicle.engine && <p className="text-zinc-500">{vehicle.engine}</p>}
            {vehicle.vin && <p className="font-mono text-xs text-zinc-400 break-all">VIN {vehicle.vin}</p>}
          </div>
          <Link href={`/vehicles/${vehicle.id}/edit`} className="min-h-11 shrink-0 px-2 text-sm text-zinc-500">
            Edit
          </Link>
        </div>
        <MileageUpdater vehicleId={vehicle.id} mileage={vehicle.current_mileage} unit={profile.distance_unit} />
        {vehicle.notes && <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{vehicle.notes}</p>}
        <Link href={`/vehicles/${vehicle.id}/jobs/new`} className={buttonClass()}>
          + Log a job
        </Link>
      </header>

      <ReminderList vehicleId={vehicle.id} reminders={sortedReminders} distanceUnit={profile.distance_unit} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Timeline</h2>
          {totalSpent > 0 && (
            <span className="text-sm text-zinc-500">
              {formatMoney(totalSpent, profile.currency)} {filter ? `on ${filter}` : "total"}
            </span>
          )}
        </div>
        <nav aria-label="Filter by type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={`/vehicles/${vehicle.id}`} className={chip(!filter)} scroll={false}>
            All
          </Link>
          {jobTypes.map((t) => (
            <Link key={t} href={`/vehicles/${vehicle.id}?type=${t}`} className={chip(filter === t)} scroll={false}>
              {t}
            </Link>
          ))}
        </nav>

        {byYear.size === 0 ? (
          <p className="text-sm text-zinc-500">{filter ? `No ${filter} jobs yet.` : "No jobs logged yet."}</p>
        ) : (
          [...byYear.entries()].map(([year, list]) => (
            <div key={year} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-zinc-500">{year}</h3>
              <ol className="relative flex flex-col gap-2 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
                {list.map((job) => (
                  <li key={job.id} className="relative">
                    <span className="absolute -left-[1.4rem] top-4 h-3 w-3 rounded-full border-2 border-background bg-amber-500" />
                    <Link
                      href={`/vehicles/${vehicle.id}/jobs/${job.id}`}
                      className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{job.title}</span>
                        <TypeBadge type={job.type} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-sm text-zinc-500">
                        <span>{formatDate(job.performed_on)}</span>
                        {job.mileage != null && <span>{formatMileage(job.mileage, profile.distance_unit)}</span>}
                        {job.total_cost_cents > 0 && <span>{formatMoney(job.total_cost_cents, profile.currency)}</span>}
                        {job.job_photos[0]?.count ? <span>📷 {job.job_photos[0].count}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
