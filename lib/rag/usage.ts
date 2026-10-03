import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { costUsd } from "./pricing";
import type { Usage } from "./types";

type UsageKind = Database["public"]["Enums"]["usage_kind"];

export async function recordUsage(
  db: SupabaseClient<Database>,
  args: { userId: string; kind: UsageKind; usage: Usage; manualId?: string; questionId?: string },
): Promise<number> {
  const cost = costUsd(args.usage.model, args.usage.inputTokens, args.usage.outputTokens);
  const { error } = await db.from("usage_events").insert({
    user_id: args.userId,
    kind: args.kind,
    provider: args.usage.provider,
    model: args.usage.model,
    input_tokens: args.usage.inputTokens,
    output_tokens: args.usage.outputTokens,
    pages: args.usage.pages ?? 0,
    cost_usd: cost,
    manual_id: args.manualId ?? null,
    question_id: args.questionId ?? null,
  });
  if (error) throw new Error(`Failed to record usage: ${error.message}`);
  return cost;
}
