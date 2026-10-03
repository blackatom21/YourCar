/**
 * PDF text-layer extraction, turned into structural blocks (headings, text,
 * tables) per page. Pages without a usable text layer are flagged for OCR.
 */
import { getDocumentProxy } from "unpdf";
import type { Block } from "./types";

export interface TextItem {
  str: string;
  x: number;
  y: number;
  fontSize: number;
  /** Rendered width; estimated from the font size when unknown. */
  width?: number;
}

export interface Line {
  text: string;
  fontSize: number;
  y: number;
}

export interface ExtractedPage {
  page: number;
  lines: Line[];
  /** True when the page has too little extractable text — likely a scan. */
  needsOcr: boolean;
}

/** Pages with fewer meaningful characters than this are treated as scanned. */
export const MIN_TEXT_CHARS = 50;

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  // Copy: pdf.js may transfer/detach the buffer it is given.
  return getDocumentProxy(new Uint8Array(bytes));
}

export function isPdf(bytes: Uint8Array): boolean {
  // "%PDF-" may be preceded by a little junk; the spec allows it within the first 1 KB.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/** Groups positioned text items into reading-order lines (top to bottom, left to right). */
export function itemsToLines(items: TextItem[]): Line[] {
  const visible = items.filter((i) => i.str.trim() !== "");
  // Sort top-to-bottom (PDF y grows upward), then left-to-right.
  visible.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { items: TextItem[]; y: number; size: number }[] = [];
  for (const item of visible) {
    const tolerance = Math.max(2, item.fontSize * 0.4);
    const line = lines.find((l) => Math.abs(l.y - item.y) <= tolerance);
    if (line) {
      line.items.push(item);
      line.size = Math.max(line.size, item.fontSize);
    } else {
      lines.push({ items: [item], y: item.y, size: item.fontSize });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const sorted = l.items.sort((a, b) => a.x - b.x);
      let text = "";
      for (const [i, it] of sorted.entries()) {
        const prev = sorted[i - 1];
        // Insert a wide gap marker for table-like column spacing.
        const prevWidth = prev ? (prev.width ?? prev.str.length * prev.fontSize * 0.5) : 0;
        const gap = prev ? it.x - (prev.x + prevWidth) : 0;
        text += i === 0 ? it.str : (gap > prev!.fontSize * 1.5 ? " | " : " ") + it.str;
      }
      return { text: text.replace(/\s+/g, " ").trim(), fontSize: Math.round(l.size * 10) / 10, y: l.y };
    })
    .filter((l) => l.text !== "");
}

export function meaningfulChars(text: string): number {
  return (text.match(/[A-Za-z0-9]/g) ?? []).length;
}

export async function extractPageRange(pdf: PdfDocument, first: number, last: number): Promise<ExtractedPage[]> {
  const out: ExtractedPage[] = [];
  for (let n = first; n <= last; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const [a, b, , , x, y] = raw.transform as number[];
      items.push({ str: raw.str, x, y, fontSize: Math.hypot(a, b), width: raw.width });
    }
    const lines = itemsToLines(items);
    const chars = lines.reduce((s, l) => s + meaningfulChars(l.text), 0);
    out.push({ page: n, lines, needsOcr: chars < MIN_TEXT_CHARS });
    page.cleanup();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Running headers/footers
// ---------------------------------------------------------------------------

function normalizeForRepeat(text: string) {
  // Page numbers change page to page; ignore digits when spotting repeats.
  return text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/**
 * Lines that repeat at the top or bottom of many pages ("2019 TACOMA REPAIR
 * MANUAL", "Page 12") are running headers/footers — noise for search and
 * misleading as section headings.
 */
export function findRepeatedLines(pages: ExtractedPage[], minShare = 0.3): Set<string> {
  const textPages = pages.filter((p) => !p.needsOcr && p.lines.length > 0);
  if (textPages.length < 4) return new Set();
  const counts = new Map<string, number>();
  for (const p of textPages) {
    const edge = new Set([...p.lines.slice(0, 2), ...p.lines.slice(-2)].map((l) => normalizeForRepeat(l.text)));
    for (const key of edge) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(textPages.length * minShare));
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([k]) => k));
}

// ---------------------------------------------------------------------------
// Headings and blocks
// ---------------------------------------------------------------------------

const NUMBERED = /^((?:\d+\.){1,4}\d*|\d+\s*[-–]\s*\d+|[A-Z]{1,3}-\d+|(?:SECTION|CHAPTER|GROUP)\s+[\dA-Z]+)\b[\s.:-]*\S/;

function bodyFontSize(lines: Line[]): number {
  // Character-weighted mode of font sizes ≈ the body text size.
  const weight = new Map<number, number>();
  for (const l of lines) weight.set(l.fontSize, (weight.get(l.fontSize) ?? 0) + l.text.length);
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weight) if (w > bestWeight) [best, bestWeight] = [size, w];
  return best || 10;
}

/** Decides whether a line is a heading; returns its level (1 = top) or 0. */
export function headingLevel(line: Line, bodySize: number): number {
  const text = line.text;
  if (text.length < 3 || text.length > 90) return 0;
  if (/[.,;:]$/.test(text) && !NUMBERED.test(text)) return 0;
  if (meaningfulChars(text) < 3) return 0;
  if (text.includes(" | ")) return 0; // table row

  const ratio = line.fontSize / bodySize;
  if (ratio >= 1.5) return 1;
  if (ratio >= 1.15) return 2;

  const numbered = text.match(/^((?:\d+\.)+\d*)\s/);
  if (numbered && ratio >= 0.95) return Math.min(4, numbered[1].split(".").filter(Boolean).length + 1);
  if (NUMBERED.test(text) && ratio >= 0.95 && text.length <= 70) return 3;

  const letters = text.replace(/[^A-Za-z]/g, "");
  const isAllCaps = letters.length >= 4 && letters === letters.toUpperCase();
  if (isAllCaps && ratio >= 0.95 && text.length <= 60 && text.split(" ").length <= 8) return 3;
  return 0;
}

/** Converts extracted lines into heading/text/table blocks, dropping running headers. */
export function linesToBlocks(lines: Line[], repeated: Set<string> = new Set()): Block[] {
  const kept = lines.filter((l) => !repeated.has(normalizeForRepeat(l.text)) && !/^(page\s*)?\d{1,4}$/i.test(l.text));
  const body = bodyFontSize(kept);
  const blocks: Block[] = [];

  const push = (type: "text" | "table", text: string) => {
    const last = blocks.at(-1);
    if (last && last.type === type) last.text += "\n" + text;
    else blocks.push({ type, text });
  };

  for (const line of kept) {
    const level = headingLevel(line, body);
    if (level) blocks.push({ type: "heading", level, text: line.text });
    else push(line.text.includes(" | ") ? "table" : "text", line.text);
  }
  return blocks;
}

/** Parses OCR Markdown into the same block structure. */
export function markdownToBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const push = (type: "text" | "table", text: string) => {
    const last = blocks.at(-1);
    if (last && last.type === type) last.text += "\n" + text;
    else blocks.push({ type, text });
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // A blank line ends a paragraph but keeps tables contiguous.
      if (blocks.at(-1)?.type === "text") blocks.push({ type: "text", text: "" });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2].replace(/\*\*/g, "").trim() });
    } else if (/^\s*\|/.test(line)) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue; // markdown table separator row
      push("table", line.trim());
    } else {
      push("text", line.trim());
    }
  }
  return blocks.filter((b) => b.type === "heading" || b.text.trim() !== "");
}

export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => (b.type === "heading" ? `${"#".repeat(b.level)} ${b.text}` : b.text))
    .join("\n\n");
}
