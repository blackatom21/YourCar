import Link from "next/link";
import { notFound } from "next/navigation";
import { TypeBadge } from "@/components/jobs/type-badge";
import { YouTubeEmbed } from "@/components/jobs/youtube-embed";
import { buttonClass } from "@/components/ui/button-styles";
import { formatDate, formatLabor, formatMileage, formatMoney, vehicleName } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { BUCKETS, signedUrls } from "@/lib/storage";
import { requireUser } from "@/lib/supabase/server";

export default async function JobPage({ params }: PageProps<"/vehicles/[vehicleId]/jobs/[jobId]">) {
  const { vehicleId, jobId } = await params;
  const [{ supabase }, profile] = await Promise.all([requireUser(), getProfile()]);

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "*, vehicles(id, year, make, model, trim), reminders(title), job_parts(*), job_videos(*), job_photos(id, storage_path, sort_order, width, height, caption)",
    )
    .eq("id", jobId)
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  if (!job || !job.vehicles) notFound();

  const bySort = <T extends { sort_order: number }>(rows: T[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const photos = bySort(job.job_photos);
  const parts = bySort(job.job_parts);
  const videos = bySort(job.job_videos);
  const urls = await signedUrls(supabase, BUCKETS.job, photos.map((p) => p.storage_path));

  return (
    <article className="flex flex-col gap-6">
      <Link href={`/vehicles/${vehicleId}`} className="text-sm text-zinc-500">
        ← {vehicleName(job.vehicles)}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TypeBadge type={job.type} />
          {job.reminders && <span className="text-xs text-zinc-500">Completes “{job.reminders.title}”</span>}
        </div>
        <h1 className="text-2xl font-bold">{job.title}</h1>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-500">Date</dt>
            <dd>{formatDate(job.performed_on)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Mileage</dt>
            <dd>{formatMileage(job.mileage, profile.distance_unit)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Labor</dt>
            <dd>{formatLabor(job.labor_minutes)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Total cost</dt>
            <dd className="font-semibold">{formatMoney(job.total_cost_cents, profile.currency)}</dd>
          </div>
        </dl>
      </header>

      {job.description && <p className="whitespace-pre-wrap leading-relaxed">{job.description}</p>}

      {photos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Photos</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => {
              const url = urls[p.storage_path];
              return (
                <li key={p.id} className="overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img
                        src={url}
                        alt={p.caption ?? ""}
                        width={p.width ?? undefined}
                        height={p.height ?? undefined}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="aspect-square" />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {parts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Parts</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {parts.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  {p.part_number && <div className="font-mono text-sm text-zinc-500 break-all">{p.part_number}</div>}
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div>{formatMoney(Math.round(Number(p.quantity) * p.unit_cost_cents), profile.currency)}</div>
                  {Number(p.quantity) !== 1 && (
                    <div className="text-zinc-500">
                      {Number(p.quantity)} × {formatMoney(p.unit_cost_cents, profile.currency)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {videos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Videos</h2>
          {videos.map((v) => (
            <YouTubeEmbed key={v.id} videoId={v.youtube_video_id} start={v.start_seconds} title={v.title} />
          ))}
        </section>
      )}

      <Link href={`/vehicles/${vehicleId}/jobs/${jobId}/edit`} className={buttonClass("secondary")}>
        Edit job
      </Link>
    </article>
  );
}
