/**
 * Safety checks on model answers before they're shown. Pure functions, unit-tested.
 *
 * The model is asked to quote specs exactly; these checks catch the cases where
 * it didn't — a number in a cited sentence that doesn't appear in the cited
 * manual text, or a spec-looking number with no citation at all.
 */

export interface CitationRef {
  citedText: string;
}

export interface AnswerBlock {
  text: string;
  citations: CitationRef[];
}

export interface Warning {
  kind: "number_not_in_source" | "uncited_spec";
  value: string;
  context: string;
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
const UNIT =
  /^\s*(?:n[·*.\s-]?m|nm|ft[·*.\s-]?lbf?|in[·*.\s-]?lbf?|lb[·*.\s-]?ft|kgf[·*.\s-]?cm|kgf[·*.\s-]?m|mm|cm|in\b|inch|psi|kpa|mpa|bar|l\b|liters?|litres?|qts?|quarts?|ml|oz|gal|°|deg|v\b|volts?|a\b|amps?|ohms?|Ω|rpm|%)/i;

/** Normalises "1,250" → "1250" and "2,65" (decimal comma) → "2.65". */
function normalizeNumber(raw: string): string {
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) return raw.replace(/,/g, "");
  if (/^\d+,\d+$/.test(raw)) return raw.replace(",", ".");
  return raw;
}

/** Numbers in a text, excluding list ordinals ("1. Remove…") and citation markers ("[2]"). */
export function extractNumbers(text: string): { value: string; hasUnit: boolean }[] {
  const out: { value: string; hasUnit: boolean }[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const start = m.index!;
    const before = text.slice(0, start);
    const after = text.slice(start + m[0].length);
    if (/(^|\n)\s*$/.test(before) && /^[.)]\s/.test(after)) continue; // list ordinal
    if (before.endsWith("[") && after.startsWith("]")) continue; // citation marker
    out.push({ value: normalizeNumber(m[0]), hasUnit: UNIT.test(after) });
  }
  return out;
}

function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(NUMBER)].map((m) => normalizeNumber(m[0])));
}

function excerpt(text: string, value: string): string {
  const i = text.indexOf(value);
  const start = Math.max(0, i - 40);
  return (start > 0 ? "…" : "") + text.slice(start, i + value.length + 40).trim() + (i + value.length + 40 < text.length ? "…" : "");
}

export function checkAnswer(blocks: AnswerBlock[]): Warning[] {
  const warnings: Warning[] = [];
  const seen = new Set<string>();
  const add = (w: Warning) => {
    const key = `${w.kind}:${w.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      warnings.push(w);
    }
  };

  for (const block of blocks) {
    const nums = extractNumbers(block.text);
    if (!nums.length) continue;
    if (block.citations.length) {
      const source = numbersIn(block.citations.map((c) => c.citedText).join("\n"));
      for (const n of nums) {
        if (!source.has(n.value)) add({ kind: "number_not_in_source", value: n.value, context: excerpt(block.text, n.value) });
      }
    } else {
      for (const n of nums) {
        if (n.hasUnit) add({ kind: "uncited_spec", value: n.value, context: excerpt(block.text, n.value) });
      }
    }
  }
  return warnings;
}
