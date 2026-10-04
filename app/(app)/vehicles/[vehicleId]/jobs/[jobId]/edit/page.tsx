import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteJob } from "../../actions";
import { JobForm } from "@/components/jobs/job-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { centsToInput, formatLabor } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { BUCKETS, signedUrls } from "@/lib/storage";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: PageProps<"/vehicles/[vehicleId]/jobs/[jobId]/edit">) {
  const { vehicleId, jobId } = await params;
  const [{ supabase, user }, profile] = await Promise.all([requireUser(), getProfile()]);

  const [{ data: job }, { data: reminders }] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, job_parts(*), job_videos(*), job_photos(id, storage_path, sort_order)")
      .eq("id", jobId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle(),
    supabase.from("reminders").select("id, title").eq("vehicle_id", vehicleId).order("title"),
  ]);
  if (!job) notFound();

  const photos = [...job.job_photos].sort((a, b) => a.sort_order - b.sort_order);
  const urls = await signedUrls(supabase, BUCKETS.job, photos.map((p) => p.storage_path));
  const bySort = <T extends { sort_order: number }>(rows: T[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <section className="flex flex-col gap-6">
      <Link href={`/vehicles/${vehicleId}/jobs/${jobId}`} className="text-sm text-zinc-500">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold">Edit job</h1>
      <JobForm
        userId={user.id}
        vehicleId={vehicleId}
        reminders={reminders ?? []}
        distanceUnit={profile.distance_unit}
        currency={profile.currency}
        existingPhotos={photos.map((p) => ({ id: p.id, url: urls[p.storage_path] ?? null }))}
        initial={{
          id: job.id,
          type: job.type,
          title: job.title,
          performed_on: job.performed_on,
          mileage: job.mileage?.toString() ?? "",
          description: job.description ?? "",
          labor: job.labor_minutes != null ? formatLabor(job.labor_minutes) : "",
          total_cost_is_manual: job.total_cost_is_manual,
          total_cost: job.total_cost_is_manual ? centsToInput(job.total_cost_cents) : "",
          reminder_id: job.reminder_id ?? "",
          parts: bySort(job.job_parts).map((p) => ({
            name: p.name,
            part_number: p.part_number ?? "",
            quantity: String(p.quantity),
            unit_cost: centsToInput(p.unit_cost_cents),
          })),
          videos: bySort(job.job_videos).map((vid) => vid.original_url),
        }}
      />
      <form action={deleteJob.bind(null, vehicleId, jobId)} className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <ConfirmButton message="Delete this job and its photos? This can't be undone.">Delete job</ConfirmButton>
      </form>
    </section>
  );
}
