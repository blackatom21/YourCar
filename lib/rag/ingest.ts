/**
 * Manual ingestion pipeline: PDF → per-page text (OCR for scanned pages) →
 * section-aware chunks → embeddings in pgvector.
 *
 * Written against a tiny StepRunner so the same code runs as durable Inngest
 * steps in production (each step retried independently, none long enough to hit
 * a serverless timeout) and inline in tests/local development.
 *
 * Runs with the service-role client (RLS bypassed), so every read and write is
 * explicitly scoped to the manual's owner.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import type { Database } from "@/lib/database.types";
import { chunkManual, embeddingText } from "./chunk";
import {
  blocksToText,
  extractPageRange,
  findRepeatedLines,
  isPdf,
  linesToBlocks,
  markdownToBlocks,
  openPdf,
} from "./extract";
import type { Block, Embedder, OcrEngine, PageBlocks } from "./types";
import { recordUsage } from "./usage";

export interface StepRunner {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

export const inlineSteps: StepRunner = { run: (_id, fn) => fn() };

export interface IngestDeps {
  db: SupabaseClient<Database>;
  embedder: Embedder;
  ocr: OcrEngine;
}

export const EXTRACT_BATCH = 100;
export const OCR_BATCH = 8;
export const OCR_CONCURRENCY = 4;
export const EMBED_BATCH = 128;
const DB_PAGE = 1000;

interface ManualInfo {
  userId: string;
  vehicleId: string;
  title: string;
  storagePath: string;
  pageCount: number;
}

// Avoid re-downloading the PDF for every step when steps run in the same process.
const pdfCache = new Map<string, Uint8Array>();

async function downloadPdf(db: SupabaseClient<Database>, path: string): Promise<Uint8Array> {
  const cached = pdfCache.get(path);
  if (cached) return cached;
  const { data, error } = await db.storage.from("manuals").download(path);
  if (error || !data) throw new Error(`Could not download the PDF: ${error?.message ?? "not found"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  pdfCache.clear();
  pdfCache.set(path, bytes);
  return bytes;
}

async function updateManual(
  db: SupabaseClient<Database>,
  manualId: string,
  userId: string,
  patch: Database["public"]["Tables"]["manuals"]["Update"],
) {
  const { error } = await db.from("manuals").update(patch).eq("id", manualId).eq("user_id", userId);
  if (error) throw new Error(`Failed to update manual: ${error.message}`);
}

function ranges(total: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let first = 1; first <= total; first += size) out.push([first, Math.min(total, first + size - 1)]);
  return out;
}

async function singlePagePdf(source: PDFDocument, pageNumber: number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(source, [pageNumber - 1]);
  out.addPage(page);
  return out.save();
}

export async function ingestManual(manualId: string, step: StepRunner, deps: IngestDeps): Promise<void> {
  const { db } = deps;

  const info = await step.run("prepare", async (): Promise<ManualInfo> => {
    const { data: m, error } = await db.from("manuals").select("*").eq("id", manualId).single();
    if (error || !m) throw new Error(`Manual ${manualId} not found.`);

    const bytes = await downloadPdf(db, m.storage_path);
    if (!isPdf(bytes)) throw new Error("This file isn't a PDF.");
    let pageCount: number;
    try {
      const pdf = await openPdf(bytes);
      pageCount = pdf.numPages;
      await pdf.loadingTask.destroy();
    } catch (err) {
      const msg = (err as Error).message ?? "";
      throw new Error(/password/i.test(msg) ? "This PDF is password-protected." : `Couldn't read this PDF: ${msg}`);
    }

    // Restartable: clear anything left by a previous attempt.
    await db.from("manual_chunks").delete().eq("manual_id", manualId).eq("user_id", m.user_id);
    await db.from("manual_pages").delete().eq("manual_id", manualId).eq("user_id", m.user_id);
    await updateManual(db, manualId, m.user_id, {
      status: "processing",
      stage: "extracting",
      page_count: pageCount,
      pages_done: 0,
      ocr_pages: 0,
      chunk_count: 0,
      error: null,
    });
    return { userId: m.user_id, vehicleId: m.vehicle_id, title: m.title, storagePath: m.storage_path, pageCount };
  });

  // 1. Text layer, in page ranges.
  const ocrNeeded: number[] = [];
  for (const [first, last] of ranges(info.pageCount, EXTRACT_BATCH)) {
    const pages = await step.run(`extract-${first}-${last}`, async () => {
      const pdf = await openPdf(await downloadPdf(db, info.storagePath));
      try {
        const extracted = await extractPageRange(pdf, first, last);
        const repeated = findRepeatedLines(extracted);
        const rows = extracted.map((p) => {
          const blocks: Block[] = p.needsOcr ? [] : linesToBlocks(p.lines, repeated);
          const text = blocksToText(blocks);
          return {
            manual_id: manualId,
            user_id: info.userId,
            page_number: p.page,
            source: p.needsOcr ? ("empty" as const) : ("text_layer" as const),
            text,
            blocks,
            char_count: text.length,
          };
        });
        const { error } = await db.from("manual_pages").upsert(rows, { onConflict: "manual_id,page_number" });
        if (error) throw new Error(`Failed to store pages: ${error.message}`);
        await updateManual(db, manualId, info.userId, { pages_done: last });
        return extracted.filter((p) => p.needsOcr).map((p) => p.page);
      } finally {
        await pdf.loadingTask.destroy();
      }
    });
    ocrNeeded.push(...pages);
  }

  // 2. OCR for scanned / image-only pages.
  if (ocrNeeded.length) {
    await step.run("ocr-start", () =>
      updateManual(db, manualId, info.userId, { stage: "ocr", ocr_pages: ocrNeeded.length }),
    );
    for (let i = 0; i < ocrNeeded.length; i += OCR_BATCH) {
      const batch = ocrNeeded.slice(i, i + OCR_BATCH);
      await step.run(`ocr-${batch[0]}-${batch.at(-1)}`, async () => {
        const source = await PDFDocument.load(await downloadPdf(db, info.storagePath), { ignoreEncryption: true });
        for (let j = 0; j < batch.length; j += OCR_CONCURRENCY) {
          await Promise.all(
            batch.slice(j, j + OCR_CONCURRENCY).map(async (pageNumber) => {
              const { markdown, usage } = await deps.ocr.ocrPage(await singlePagePdf(source, pageNumber), pageNumber);
              await recordUsage(db, { userId: info.userId, kind: "ocr", usage, manualId });
              const blocks = markdownToBlocks(markdown);
              const text = blocksToText(blocks);
              const { error } = await db
                .from("manual_pages")
                .update({ source: text ? "ocr" : "empty", blocks, text, char_count: text.length })
                .eq("manual_id", manualId)
                .eq("user_id", info.userId)
                .eq("page_number", pageNumber);
              if (error) throw new Error(`Failed to store OCR text: ${error.message}`);
            }),
          );
        }
      });
    }
  }

  // 3. Chunk the whole manual in page order (section headings span pages).
  const chunkCount = await step.run("chunk", async () => {
    await updateManual(db, manualId, info.userId, { stage: "chunking" });
    const pages: PageBlocks[] = [];
    for (let from = 0; ; from += DB_PAGE) {
      const { data, error } = await db
        .from("manual_pages")
        .select("page_number, blocks")
        .eq("manual_id", manualId)
        .eq("user_id", info.userId)
        .order("page_number")
        .range(from, from + DB_PAGE - 1);
      if (error) throw new Error(`Failed to load pages: ${error.message}`);
      pages.push(...data.map((p) => ({ page: p.page_number, blocks: p.blocks as unknown as Block[] })));
      if (data.length < DB_PAGE) break;
    }

    const chunks = chunkManual(pages);
    await db.from("manual_chunks").delete().eq("manual_id", manualId).eq("user_id", info.userId);
    for (let i = 0; i < chunks.length; i += 500) {
      const { error } = await db.from("manual_chunks").insert(
        chunks.slice(i, i + 500).map((c) => ({
          manual_id: manualId,
          user_id: info.userId,
          vehicle_id: info.vehicleId,
          chunk_index: c.index,
          page_start: c.pageStart,
          page_end: c.pageEnd,
          section_path: c.sectionPath,
          content: c.content,
          segments: c.segments as unknown as Database["public"]["Tables"]["manual_chunks"]["Insert"]["segments"],
          token_count: Math.ceil(c.content.length / 4),
        })),
      );
      if (error) throw new Error(`Failed to store chunks: ${error.message}`);
    }
    await updateManual(db, manualId, info.userId, { chunk_count: chunks.length, stage: "embedding" });
    return chunks.length;
  });

  // 4. Embeddings, in batches.
  for (let start = 0; start < chunkCount; start += EMBED_BATCH) {
    const end = Math.min(chunkCount, start + EMBED_BATCH) - 1;
    await step.run(`embed-${start}-${end}`, async () => {
      const { data: rows, error } = await db
        .from("manual_chunks")
        .select("id, section_path, content")
        .eq("manual_id", manualId)
        .eq("user_id", info.userId)
        .gte("chunk_index", start)
        .lte("chunk_index", end)
        .order("chunk_index");
      if (error) throw new Error(`Failed to load chunks: ${error.message}`);

      const { vectors, usage } = await deps.embedder.embed(
        rows.map((r) => embeddingText(info.title, { sectionPath: r.section_path, content: r.content })),
        "document",
      );
      await recordUsage(db, { userId: info.userId, kind: "embed_document", usage, manualId });

      await Promise.all(
        rows.map(async (r, i) => {
          const { error: upErr } = await db
            .from("manual_chunks")
            .update({ embedding: JSON.stringify(vectors[i]) })
            .eq("id", r.id)
            .eq("user_id", info.userId);
          if (upErr) throw new Error(`Failed to store embedding: ${upErr.message}`);
        }),
      );
    });
  }

  // 5. Done: roll up cost and mark ready.
  await step.run("finalize", async () => {
    const { data: events } = await db
      .from("usage_events")
      .select("cost_usd")
      .eq("manual_id", manualId)
      .eq("user_id", info.userId);
    const total = (events ?? []).reduce((s, e) => s + Number(e.cost_usd), 0);
    await updateManual(db, manualId, info.userId, {
      status: "ready",
      stage: null,
      ingest_cost_usd: total,
      processed_at: new Date().toISOString(),
    });
    pdfCache.delete(info.storagePath);
  });
}

/** Records a failure in a form the UI can show. */
export async function markIngestFailed(db: SupabaseClient<Database>, manualId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .from("manuals")
    .update({ status: "failed", stage: null, error: message.slice(0, 1000) })
    .eq("id", manualId);
}
