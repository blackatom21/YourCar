import "server-only";
import type { Embedder, Reranker } from "./types";
import { EMBEDDING_DIMENSIONS } from "./types";

const API = "https://api.voyageai.com/v1";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "voyage-3.5";
export const RERANK_MODEL = process.env.RERANK_MODEL || "rerank-2.5";

/** Voyage accepts up to 1,000 inputs per embeddings request; we stay well below. */
const MAX_BATCH = 128;

async function post<T>(path: string, body: unknown, attempt = 0): Promise<T> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set.");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return post(path, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Voyage ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const voyageEmbedder: Embedder = {
  model: EMBEDDING_MODEL,
  async embed(texts, kind) {
    const vectors: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const res = await post<{ data: { embedding: number[]; index: number }[]; usage: { total_tokens: number } }>(
        "/embeddings",
        {
          model: EMBEDDING_MODEL,
          input: texts.slice(i, i + MAX_BATCH),
          input_type: kind,
          output_dimension: EMBEDDING_DIMENSIONS,
        },
      );
      for (const d of [...res.data].sort((a, b) => a.index - b.index)) {
        if (d.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embeddings, got ${d.embedding.length}.`);
        }
        vectors.push(d.embedding);
      }
      tokens += res.usage.total_tokens;
    }
    return { vectors, usage: { provider: "voyage", model: EMBEDDING_MODEL, inputTokens: tokens, outputTokens: 0 } };
  },
};

export const voyageReranker: Reranker = {
  model: RERANK_MODEL,
  async rerank(query, documents, topK) {
    const res = await post<{ data: { index: number; relevance_score: number }[]; usage: { total_tokens: number } }>(
      "/rerank",
      { model: RERANK_MODEL, query, documents, top_k: topK },
    );
    return {
      results: res.data.map((d) => ({ index: d.index, score: d.relevance_score })),
      usage: { provider: "voyage", model: RERANK_MODEL, inputTokens: res.usage.total_tokens, outputTokens: 0 },
    };
  },
};
