import "server-only";
import { Inngest } from "inngest";
import { ingestManual, markIngestFailed } from "@/lib/rag/ingest";
import { getProviders } from "@/lib/rag/providers";
import { createAdminClient } from "@/lib/supabase/admin";

export const inngest = new Inngest({ id: "garage-log" });

export const MANUAL_UPLOADED = "manual/uploaded";

/**
 * Durable manual ingestion. Each `step.run` is its own short HTTP invocation
 * with independent retries, so a 1,000-page manual never hits a function timeout.
 */
export const ingestManualFn = inngest.createFunction(
  {
    id: "ingest-manual",
    triggers: [{ event: MANUAL_UPLOADED }],
    retries: 3,
    // At most two manuals processing per user at once; others queue.
    concurrency: { limit: 2, key: "event.data.userId" },
    onFailure: async ({ event, error }) => {
      const manualId = (event.data as { event?: { data?: { manualId?: string } } }).event?.data?.manualId;
      if (manualId) await markIngestFailed(createAdminClient(), manualId, error);
    },
  },
  async ({ event, step }) => {
    const { manualId } = event.data as { manualId: string };
    const { embedder, ocr } = await getProviders();
    await ingestManual(manualId, { run: (id, fn) => step.run(id, fn) as never }, { db: createAdminClient(), embedder, ocr });
    return { manualId };
  },
);
