import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Service-role client: BYPASSES row-level security. Only for the ingestion
 * worker and server-side bookkeeping (usage/cost, Q&A records). Every query
 * made with it must be explicitly scoped to the owning user's id.
 */
export function createAdminClient() {
  // Prefer the new-format secret key; the legacy service_role key still works.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not set.");
  return createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
