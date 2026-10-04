import "server-only";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { anthropic, ANSWER_MODEL } from "./anthropic";
import type { AnswerLlm, LlmTextBlock } from "./answer";

/**
 * Claude adapter: each retrieved chunk becomes a `search_result` block with
 * citations enabled and one text block per manual page, so every citation
 * comes back pointing at exact page(s).
 *
 * Server-side refusal fallback is enabled ("default" routing): if the primary
 * model declines, the API re-runs the request on a fallback model in the same
 * call. Usage and pricing use the model that actually served the response.
 */
export const claudeAnswerLlm: AnswerLlm = {
  model: ANSWER_MODEL,
  async generate({ system, vehicle, question, results }) {
    const content: BetaContentBlockParam[] = [
      ...results.map(
        (r): BetaContentBlockParam => ({
          type: "search_result",
          source: r.source,
          title: r.title,
          content: r.blocks.map((text) => ({ type: "text" as const, text: text || " " })),
          citations: { enabled: true },
        }),
      ),
      { type: "text", text: `Vehicle: ${vehicle || "unspecified"}\n\nQuestion: ${question}` },
    ];

    const response = await anthropic().beta.messages.create({
      model: ANSWER_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content }],
    });

    const blocks: LlmTextBlock[] = [];
    for (const block of response.content) {
      if (block.type !== "text") continue;
      blocks.push({
        text: block.text,
        citations: (block.citations ?? []).flatMap((c) =>
          c.type === "search_result_location"
            ? [
                {
                  searchResultIndex: c.search_result_index,
                  startBlock: c.start_block_index,
                  endBlock: c.end_block_index,
                  citedText: c.cited_text,
                },
              ]
            : [],
        ),
      });
    }

    return {
      blocks,
      refused: response.stop_reason === "refusal",
      usage: {
        provider: "anthropic",
        model: response.model,
        inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
      },
    };
  },
};
