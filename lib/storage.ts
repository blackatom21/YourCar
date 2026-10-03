import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const BUCKETS = { vehicle: "vehicle-photos", job: "job-photos" } as const;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Signed URLs for private objects, keyed by path. Missing/forbidden paths are omitted. */
export async function signedUrls(
  supabase: SupabaseClient<Database>,
  bucket: string,
  paths: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}
