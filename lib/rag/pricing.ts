/**
 * Per-unit prices used to estimate cost. Providers change prices; this table is
 * the single place to update, and each usage_event stores the cost computed at
 * the time, so history stays accurate after an update.
 *
 * Claude prices: Anthropic API list prices as of 2026-09 ($ per 1M tokens).
 * Voyage prices: last published list prices known to us — VERIFY before relying
 * on them (docs.voyageai.com was not reachable when this was written).
 */
const PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "voyage-3.5": { input: 0.06, output: 0 },
  "voyage-3.5-lite": { input: 0.02, output: 0 },
  "voyage-context-3": { input: 0.18, output: 0 },
  "voyage-3-large": { input: 0.18, output: 0 },
  "rerank-2.5": { input: 0.05, output: 0 },
  "rerank-2.5-lite": { input: 0.02, output: 0 },
};

/** Finds the price entry for a model id, tolerating dated snapshots ("claude-haiku-4-5-20251001"). */
function priceFor(model: string) {
  if (PER_MILLION[model]) return PER_MILLION[model];
  const key = Object.keys(PER_MILLION)
    .filter((k) => model.startsWith(k + "-"))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PER_MILLION[key] : undefined;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  if (!price) return 0; // Unknown/fake models are tracked with zero cost.
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function formatUsd(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
