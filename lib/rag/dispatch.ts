import "server-only";
import { after } from "next/server";
import { ingestManual, inlineSteps, markIngestFailed } from "./ingest";
import { getProviders } from "./providers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "inngest" (production): durable background job with per-step retries.
 * "inline" (local dev without Inngest): runs after the response is sent, in the
 * same server process. Fine for small manuals; not for production-sized ones.
 */
export function ingestRunner(): "inngest" | "inline" {
  const configured = process.env.INGEST_RUNNER;
  if (configured === "inline" || configured === "inngest") return configured;
  return process.env.INNGEST_EVENT_KEY || process.env.INNGEST_DEV ? "inngest" : "inline";
}

export async function dispatchIngestion(manualId: string, userId: string) {
  if (ingestRunner() === "inngest") {
    const { inngest, MANUAL_UPLOADED } = await import("@/lib/inngest");
    await inngest.send({ name: MANUAL_UPLOADED, data: { manualId, userId } });
    return;
  }
  after(async () => {
    const db = createAdminClient();
    try {
      const { embedder, ocr } = await getProviders();
      await ingestManual(manualId, inlineSteps, { db, embedder, ocr });
    } catch (err) {
      console.error(`Ingestion failed for manual ${manualId}:`, err);
      await markIngestFailed(db, manualId, err);
    }
  });
}
