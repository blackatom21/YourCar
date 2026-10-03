/**
 * Deterministic stand-ins for the AI providers. Used by tests, and in local
 * development when RAG_PROVIDERS=fake so the full pipeline runs without API keys.
 *
 * The fake embedder is a hashed bag-of-words: texts that share words get similar
 * vectors, so retrieval behaves sensibly (if crudely) end to end.
 */
import { EMBEDDING_DIMENSIONS, type Embedder, type OcrEngine, type Reranker } from "./types";

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function hash(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function fakeVector(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const t of tokens(text)) v[hash(t) % EMBEDDING_DIMENSIONS] += 1;
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export const fakeEmbedder: Embedder = {
  model: "fake-embed",
  async embed(texts) {
    const inputTokens = texts.reduce((n, t) => n + tokens(t).length, 0);
    return {
      vectors: texts.map(fakeVector),
      usage: { provider: "fake", model: "fake-embed", inputTokens, outputTokens: 0 },
    };
  },
};

export const fakeReranker: Reranker = {
  model: "fake-rerank",
  async rerank(query, documents, topK) {
    const q = new Set(tokens(query));
    const scored = documents.map((d, index) => {
      const words = new Set(tokens(d));
      const hits = [...q].filter((w) => words.has(w)).length;
      return { index, score: q.size ? hits / q.size : 0 };
    });
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return {
      results: scored.slice(0, topK),
      usage: { provider: "fake", model: "fake-rerank", inputTokens: 0, outputTokens: 0 },
    };
  },
};

/** Returns a canned transcription so OCR'd pages are recognisable in tests. */
export function makeFakeOcr(transcribe: (page: number) => string = (p) => `# Scanned page ${p}\n\nOCR text for page ${p}.`): OcrEngine {
  return {
    model: "fake-ocr",
    async ocrPage(_pdf, pageNumber) {
      return {
        markdown: transcribe(pageNumber),
        usage: { provider: "fake", model: "fake-ocr", inputTokens: 0, outputTokens: 0, pages: 1 },
      };
    },
  };
}
