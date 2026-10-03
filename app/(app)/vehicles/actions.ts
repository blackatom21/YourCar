"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { BUCKETS } from "@/lib/storage";
import { vehicleSchema, type VehicleInput } from "@/lib/validation";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function saveVehicle(
  vehicleId: string | null,
  input: VehicleInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();

  const query = vehicleId
    ? supabase.from("vehicles").update(parsed.data).eq("id", vehicleId)
    : supabase.from("vehicles").insert(parsed.data);
  const { data, error } = await query.select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't save the vehicle. Please try again." };

  revalidatePath("/vehicles");
  return { ok: true, data: { id: data.id } };
}

/** Points the vehicle at a newly uploaded cover photo and removes the old file. */
export async function setVehicleCover(vehicleId: string, path: string | null): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (path && !path.startsWith(`${user.id}/${vehicleId}/`)) return { ok: false, error: "Invalid photo path." };

  const { data: current } = await supabase
    .from("vehicles")
    .select("cover_photo_path")
    .eq("id", vehicleId)
    .single();
  const { error } = await supabase.from("vehicles").update({ cover_photo_path: path }).eq("id", vehicleId);
  if (error) return { ok: false, error: "Couldn't update the cover photo." };

  if (current?.cover_photo_path && current.cover_photo_path !== path) {
    await supabase.storage.from(BUCKETS.vehicle).remove([current.cover_photo_path]);
  }
  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true, data: undefined };
}

export async function updateMileage(vehicleId: string, mileage: number): Promise<ActionResult> {
  const parsed = z.number().int().min(0).max(10_000_000).safeParse(mileage);
  if (!parsed.success) return { ok: false, error: "Enter a whole number." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("vehicles").update({ current_mileage: parsed.data }).eq("id", vehicleId);
  if (error) return { ok: false, error: "Couldn't update mileage." };
  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true, data: undefined };
}

export async function deleteVehicle(vehicleId: string) {
  const { supabase, user } = await requireUser();

  // Collect files first; rows cascade on delete but storage objects don't.
  const [{ data: vehicle }, { data: photos }] = await Promise.all([
    supabase.from("vehicles").select("cover_photo_path").eq("id", vehicleId).single(),
    supabase.from("job_photos").select("storage_path, jobs!inner(vehicle_id)").eq("jobs.vehicle_id", vehicleId),
  ]);

  const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
  if (error) throw new Error("Couldn't delete the vehicle.");

  const jobPaths = (photos ?? []).map((p) => p.storage_path);
  if (jobPaths.length) await supabase.storage.from(BUCKETS.job).remove(jobPaths);
  if (vehicle?.cover_photo_path) await supabase.storage.from(BUCKETS.vehicle).remove([vehicle.cover_photo_path]);
  // Defensive sweep for anything else under this vehicle's folder.
  const { data: leftovers } = await supabase.storage.from(BUCKETS.vehicle).list(`${user.id}/${vehicleId}`);
  if (leftovers?.length) {
    await supabase.storage.from(BUCKETS.vehicle).remove(leftovers.map((f) => `${user.id}/${vehicleId}/${f.name}`));
  }

  revalidatePath("/vehicles");
  redirect("/vehicles");
}
