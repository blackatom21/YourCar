import type { AnswerLlm } from "./answer";

/**
 * Local-dev stand-in for Claude (RAG_PROVIDERS=fake): "answers" by quoting the
 * first retrieved page that shares a word with the question, with a real
 * citation, or replies NOT_FOUND. Lets the whole UI be exercised without keys.
 */
export const fakeAnswerLlm: AnswerLlm = {
  model: "fake-llm",
  async generate({ question, results }) {
    const words = new Set(question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
    for (const [ri, r] of results.entries()) {
      for (const [bi, text] of r.blocks.entries()) {
        const line = text.split("\n").find((l) => [...words].some((w) => l.toLowerCase().includes(w)));
        if (line) {
          return {
            blocks: [{ text: `From the manual: ${line}`, citations: [{ searchResultIndex: ri, startBlock: bi, endBlock: bi + 1, citedText: text }] }],
            usage: { provider: "fake", model: "fake-llm", inputTokens: 0, outputTokens: 0 },
            refused: false,
          };
        }
      }
    }
    return {
      blocks: [{ text: "NOT_FOUND: The retrieved excerpts don't mention this.", citations: [] }],
      usage: { provider: "fake", model: "fake-llm", inputTokens: 0, outputTokens: 0 },
      refused: false,
    };
  },
};
