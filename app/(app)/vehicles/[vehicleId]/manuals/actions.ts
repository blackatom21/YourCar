"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "../../actions";
import { dispatchIngestion } from "@/lib/rag/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const MAX_MANUAL_BYTES = 500 * 1024 * 1024;

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the manual a title.").max(200),
  filename: z.string().max(300),
  size: z.number().int().positive().max(MAX_MANUAL_BYTES, "Manuals can be up to 500 MB."),
});

/** Step 1: reserve a manual row; the browser then uploads straight to Storage at `path`. */
export async function createManualUpload(
  vehicleId: string,
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ manualId: string; path: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!/\.pdf$/i.test(parsed.data.filename)) return { ok: false, error: "Only PDF files are supported." };

  const { supabase, user } = await requireUser();
  const id = randomUUID();
  const path = `${user.id}/${id}.pdf`;
  const { error } = await supabase.from("manuals").insert({
    id,
    vehicle_id: vehicleId,
    title: parsed.data.title,
    original_filename: parsed.data.filename,
    size_bytes: parsed.data.size,
    storage_path: path,
  });
  if (error) return { ok: false, error: "Couldn't start the upload." };
  return { ok: true, data: { manualId: id, path } };
}

/** Step 2: after the upload completes, queue processing. */
export async function finishManualUpload(manualId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: manual } = await supabase.from("manuals").select("id, vehicle_id, status, storage_path").eq("id", manualId).single();
  if (!manual) return { ok: false, error: "Manual not found." };
  if (manual.status !== "uploading") return { ok: true, data: undefined };

  const [folder, file] = manual.storage_path.split("/");
  const { data: objects } = await supabase.storage.from("manuals").list(folder, { search: file });
  if (!objects?.some((o) => o.name === file)) return { ok: false, error: "The upload didn't finish. Please try again." };

  // Status is server-controlled: only the service role may change it (scoped to this user).
  const admin = createAdminClient();
  await admin.from("manuals").update({ status: "queued", stage: null, error: null }).eq("id", manualId).eq("user_id", user.id);
  await dispatchIngestion(manualId, user.id);
  revalidatePath(`/vehicles/${manual.vehicle_id}/manuals`);
  return { ok: true, data: undefined };
}

export async function retryManual(manualId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: manual } = await supabase.from("manuals").select("id, vehicle_id, status").eq("id", manualId).single();
  if (!manual) return { ok: false, error: "Manual not found." };
  if (manual.status !== "failed") return { ok: false, error: "Only failed manuals can be retried." };
  const admin = createAdminClient();
  await admin.from("manuals").update({ status: "queued", error: null }).eq("id", manualId).eq("user_id", user.id);
  await dispatchIngestion(manualId, user.id);
  revalidatePath(`/vehicles/${manual.vehicle_id}/manuals`);
  return { ok: true, data: undefined };
}

export async function renameManual(manualId: string, title: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1).max(200).safeParse(title);
  if (!parsed.success) return { ok: false, error: "Enter a title." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("manuals").update({ title: parsed.data }).eq("id", manualId).select("vehicle_id").single();
  if (error || !data) return { ok: false, error: "Couldn't rename the manual." };
  revalidatePath(`/vehicles/${data.vehicle_id}/manuals`);
  return { ok: true, data: undefined };
}

export async function deleteManual(manualId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("manuals").delete().eq("id", manualId).select("vehicle_id, storage_path").single();
  if (error || !data) return { ok: false, error: "Couldn't delete the manual." };
  await supabase.storage.from("manuals").remove([data.storage_path]);
  revalidatePath(`/vehicles/${data.vehicle_id}/manuals`);
  return { ok: true, data: undefined };
}
