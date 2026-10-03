"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "../../actions";
import { requireUser } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/storage";
import { jobSchema, photoSchema, type JobInput } from "@/lib/validation";

export async function saveJob(input: JobInput): Promise<ActionResult<{ id: string }>> {
  const parsed = jobSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { parts, videos, ...job } = parsed.data;

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("save_job", { job, parts, videos });
  if (error || !data) return { ok: false, error: "Couldn't save the job. Please try again." };

  revalidatePath(`/vehicles/${job.vehicle_id}`);
  return { ok: true, data: { id: data } };
}

export async function addJobPhotos(jobId: string, photos: z.input<typeof photoSchema>[]): Promise<ActionResult> {
  const parsed = z.array(photoSchema).max(50).safeParse(photos);
  if (!parsed.success) return { ok: false, error: "Invalid photo data." };
  const { supabase, user } = await requireUser();

  const prefix = `${user.id}/${jobId}/`;
  if (parsed.data.some((p) => !p.storage_path.startsWith(prefix))) {
    return { ok: false, error: "Invalid photo path." };
  }

  const { count } = await supabase.from("job_photos").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  const rows = parsed.data.map((p, i) => ({ ...p, job_id: jobId, sort_order: (count ?? 0) + i }));
  const { error } = await supabase.from("job_photos").insert(rows);
  if (error) {
    await supabase.storage.from(BUCKETS.job).remove(parsed.data.map((p) => p.storage_path));
    return { ok: false, error: "Couldn't attach the photos." };
  }
  return { ok: true, data: undefined };
}

export async function deleteJobPhoto(photoId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("job_photos")
    .delete()
    .eq("id", photoId)
    .select("storage_path, jobs(vehicle_id, id)")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't delete the photo." };
  await supabase.storage.from(BUCKETS.job).remove([data.storage_path]);
  if (data.jobs) revalidatePath(`/vehicles/${data.jobs.vehicle_id}/jobs/${data.jobs.id}`);
  return { ok: true, data: undefined };
}

export async function deleteJob(vehicleId: string, jobId: string) {
  const { supabase } = await requireUser();
  const { data: photos } = await supabase.from("job_photos").select("storage_path").eq("job_id", jobId);
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) throw new Error("Couldn't delete the job.");
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length) await supabase.storage.from(BUCKETS.job).remove(paths);
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(`/vehicles/${vehicleId}`);
}
