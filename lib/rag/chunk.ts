/**
 * Splits a manual's page blocks into retrieval chunks that:
 *   - keep track of which page(s) each piece of text came from (segments),
 *   - carry the heading path they sit under ("Rear Axle > Drain and Fill"),
 *   - start a new chunk at section boundaries,
 *   - never split a table unless it is enormous (then split by rows, repeating the header).
 */
import type { Block, Chunk, PageBlocks, Segment } from "./types";

export interface ChunkOptions {
  /** Soft target size in characters (~4 chars per token → ~500 tokens). */
  maxChars: number;
  /** Chunks smaller than this are merged into the next one at minor headings. */
  minChars: number;
  /** Characters of trailing text carried into the next chunk for context. */
  overlapChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { maxChars: 2000, minChars: 400, overlapChars: 250 };

interface Piece {
  page: number;
  text: string;
  kind: "text" | "table";
}

function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > max) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function splitTable(text: string, max: number): string[] {
  if (text.length <= max * 2) return [text];
  const rows = text.split("\n");
  const header = rows[0];
  const out: string[] = [];
  let cur = header;
  for (const row of rows.slice(1)) {
    if (cur.length + row.length + 1 > max) {
      out.push(cur);
      cur = header;
    }
    cur += "\n" + row;
  }
  out.push(cur);
  return out;
}

function mergeSegments(pieces: Piece[]): Segment[] {
  const segs: Segment[] = [];
  for (const p of pieces) {
    const last = segs.at(-1);
    if (last && last.page === p.page) last.text += "\n\n" + p.text;
    else segs.push({ page: p.page, text: p.text });
  }
  return segs;
}

export function chunkManual(pages: PageBlocks[], opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS): Chunk[] {
  const chunks: Chunk[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let pieces: Piece[] = [];
  let size = 0;
  // False while `pieces` holds only overlap carried from the previous chunk.
  let hasNew = false;
  let chunkPath: string | null = null;

  const currentPath = () => (headingStack.length ? headingStack.map((h) => h.text).join(" > ") : null);

  const flush = (carryOverlap: boolean) => {
    if (!hasNew) return;
    const segments = mergeSegments(pieces);
    chunks.push({
      index: chunks.length,
      pageStart: Math.min(...pieces.map((p) => p.page)),
      pageEnd: Math.max(...pieces.map((p) => p.page)),
      sectionPath: chunkPath,
      content: segments.map((s) => s.text).join("\n\n"),
      segments,
    });
    const last = pieces.at(-1)!;
    pieces = [];
    size = 0;
    hasNew = false;
    if (carryOverlap && last.kind === "text" && opts.overlapChars > 0) {
      const tail = last.text.slice(-opts.overlapChars);
      const cut = tail.search(/[.!?]\s+\S/); // start the overlap at a sentence boundary when possible
      const overlap = (cut >= 0 ? tail.slice(cut + 1) : tail).trim();
      if (overlap) {
        pieces.push({ page: last.page, text: overlap, kind: "text" });
        size = overlap.length;
      }
    }
  };

  for (const { page, blocks } of pages) {
    for (const block of blocks as Block[]) {
      if (block.type === "heading") {
        if (hasNew && (block.level <= 2 || size >= opts.minChars)) {
          flush(false);
        } else if (!hasNew) {
          // Overlap from the previous section doesn't belong in a new section.
          pieces = [];
          size = 0;
        }
        while (headingStack.length && headingStack.at(-1)!.level >= block.level) headingStack.pop();
        headingStack.push({ level: block.level, text: block.text });
        if (!hasNew) chunkPath = currentPath();
        continue;
      }

      const parts =
        block.type === "table" ? splitTable(block.text, opts.maxChars) : splitLongText(block.text, opts.maxChars);
      for (const part of parts) {
        if (hasNew && size + part.length > opts.maxChars) {
          flush(block.type === "text" && pieces.at(-1)?.kind === "text");
        }
        if (!hasNew) chunkPath = currentPath();
        pieces.push({ page, text: part, kind: block.type });
        size += part.length;
        hasNew = true;
      }
    }
  }
  flush(false);
  return chunks;
}

/** Text sent to the embedding model: manual + section context helps retrieval. */
export function embeddingText(manualTitle: string, chunk: Pick<Chunk, "sectionPath" | "content">): string {
  return [manualTitle, chunk.sectionPath, "", chunk.content].filter((s) => s !== null).join("\n");
}
