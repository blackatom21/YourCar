import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/supabase/server";

export const getProfile = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return {
    distance_unit: data?.distance_unit ?? "mi",
    currency: data?.currency ?? "USD",
    display_name: data?.display_name ?? null,
  };
});
