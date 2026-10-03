/** Provider-agnostic interfaces for the manual pipeline, so tests can swap in fakes. */

export interface Usage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  pages?: number;
}

export interface Embedder {
  readonly model: string;
  /** "document" for manual chunks, "query" for questions (asymmetric retrieval). */
  embed(texts: string[], kind: "document" | "query"): Promise<{ vectors: number[][]; usage: Usage }>;
}

export interface RerankResult {
  index: number;
  score: number;
}

export interface Reranker {
  readonly model: string;
  rerank(query: string, documents: string[], topK: number): Promise<{ results: RerankResult[]; usage: Usage }>;
}

export interface OcrEngine {
  readonly model: string;
  /** Transcribes a single-page PDF to Markdown (headings as #, tables as | rows). */
  ocrPage(singlePagePdf: Uint8Array, pageNumber: number): Promise<{ markdown: string; usage: Usage }>;
}

/** Structural blocks stored per page and consumed by the chunker. */
export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "text"; text: string }
  | { type: "table"; text: string };

export interface PageBlocks {
  page: number;
  blocks: Block[];
}

export interface Segment {
  page: number;
  text: string;
}

export interface Chunk {
  index: number;
  pageStart: number;
  pageEnd: number;
  sectionPath: string | null;
  content: string;
  segments: Segment[];
}

export const EMBEDDING_DIMENSIONS = 1024;
