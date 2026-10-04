import { serve } from "inngest/next";
import { inngest, ingestManualFn } from "@/lib/inngest";

// Each step is short, but OCR batches can take a minute; give them headroom.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: [ingestManualFn] });
