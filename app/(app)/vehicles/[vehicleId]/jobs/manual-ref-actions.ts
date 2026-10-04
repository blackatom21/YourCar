"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "../../actions";
import { requireUser } from "@/lib/supabase/server";

const refSchema = z.object({
  jobId: z.uuid(),
  manualId: z.uuid(),
  page: z.coerce.number().int().min(1).max(100000),
  label: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

export async function addJobManualRef(input: z.input<typeof refSchema>): Promise<ActionResult> {
  const parsed = refSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();
  const { data: manual } = await supabase.from("manuals").select("page_count").eq("id", parsed.data.manualId).single();
  if (manual?.page_count && parsed.data.page > manual.page_count) {
    return { ok: false, error: `That manual has ${manual.page_count} pages.` };
  }
  const { data, error } = await supabase
    .from("job_manual_refs")
    .insert({ job_id: parsed.data.jobId, manual_id: parsed.data.manualId, page: parsed.data.page, label: parsed.data.label })
    .select("jobs(vehicle_id)")
    .single();
  if (error) return { ok: false, error: "Couldn't save the reference." };
  if (data?.jobs) revalidatePath(`/vehicles/${data.jobs.vehicle_id}/jobs/${parsed.data.jobId}`);
  return { ok: true, data: undefined };
}

export async function deleteJobManualRef(refId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("job_manual_refs").delete().eq("id", refId).select("job_id, jobs(vehicle_id)").single();
  if (data?.jobs) revalidatePath(`/vehicles/${data.jobs.vehicle_id}/jobs/${data.job_id}`);
  return { ok: true, data: undefined };
}
