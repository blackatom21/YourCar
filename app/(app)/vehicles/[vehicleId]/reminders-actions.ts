"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "../actions";
import { requireUser } from "@/lib/supabase/server";
import { reminderSchema } from "@/lib/validation";

function fromForm(formData: FormData) {
  return reminderSchema.safeParse({
    title: formData.get("title"),
    interval_miles: formData.get("interval_miles")?.toString().replace(/,/g, ""),
    interval_months: formData.get("interval_months"),
    last_done_mileage: formData.get("last_done_mileage")?.toString().replace(/,/g, ""),
    last_done_on: formData.get("last_done_on"),
    category: formData.get("category"),
    part_spec: formData.get("part_spec"),
    notes: formData.get("notes"),
  });
}

export async function saveReminder(
  vehicleId: string,
  reminderId: string | null,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = fromForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();

  const { error } = reminderId
    ? await supabase.from("reminders").update(parsed.data).eq("id", reminderId)
    : await supabase.from("reminders").insert({ ...parsed.data, vehicle_id: vehicleId });
  if (error) return { ok: false, error: "Couldn't save the reminder." };

  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true, data: undefined };
}

export async function deleteReminder(vehicleId: string, reminderId: string) {
  const { supabase } = await requireUser();
  await supabase.from("reminders").delete().eq("id", reminderId);
  revalidatePath(`/vehicles/${vehicleId}`);
}
