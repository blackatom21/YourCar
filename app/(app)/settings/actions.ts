"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "../vehicles/actions";
import { requireUser } from "@/lib/supabase/server";

const schema = z.object({
  display_name: z.string().trim().max(100).transform((v) => v || null),
  distance_unit: z.enum(["mi", "km"]),
  currency: z.string().regex(/^[A-Z]{3}$/, "Pick a currency."),
});

export async function saveSettings(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save settings." };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
