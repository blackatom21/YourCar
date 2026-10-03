import "server-only";
import { fakeEmbedder, fakeReranker, makeFakeOcr } from "./fake";
import type { Embedder, OcrEngine, Reranker } from "./types";

export interface Providers {
  embedder: Embedder;
  reranker: Reranker;
  ocr: OcrEngine;
}

/**
 * RAG_PROVIDERS=fake runs the whole pipeline with deterministic local stand-ins
 * (no API keys, no cost) — used by tests and for UI work. Anything else uses
 * the real providers.
 */
export async function getProviders(): Promise<Providers> {
  if (process.env.RAG_PROVIDERS === "fake") {
    return { embedder: fakeEmbedder, reranker: fakeReranker, ocr: makeFakeOcr() };
  }
  const [{ voyageEmbedder, voyageReranker }, { claudeOcr }] = await Promise.all([import("./voyage"), import("./ocr")]);
  return { embedder: voyageEmbedder, reranker: voyageReranker, ocr: claudeOcr };
}
