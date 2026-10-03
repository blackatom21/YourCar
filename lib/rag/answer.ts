/**
 * Manual Q&A: hybrid retrieval → rerank → Claude with citable search results →
 * strict grounding checks → stored answer with per-page citations and cost.
 *
 * Grounding policy (v1): an answer is shown only if it carries at least one
 * citation into the retrieved manual text. Otherwise the user gets a clear
 * "not found in your manuals" — never an uncited answer from general knowledge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { costUsd } from "./pricing";
import type { Embedder, Reranker, Segment, Usage } from "./types";
import { recordUsage } from "./usage";
import { checkAnswer, type Warning } from "./validate";

// ---------------------------------------------------------------------------
// LLM adapter interface (Claude in production, scripted fakes in tests)
// ---------------------------------------------------------------------------

export interface SearchResultInput {
  source: string;
  title: string;
  /** One citable text block per manual page in the chunk. */
  blocks: string[];
}

export interface LlmCitation {
  searchResultIndex: number;
  startBlock: number;
  endBlock: number;
  citedText: string;
}

export interface LlmTextBlock {
  text: string;
  citations: LlmCitation[];
}

export interface AnswerLlm {
  readonly model: string;
  generate(input: {
    system: string;
    vehicle: string;
    question: string;
    results: SearchResultInput[];
  }): Promise<{ blocks: LlmTextBlock[]; usage: Usage; refused: boolean }>;
}

// ---------------------------------------------------------------------------
// Result types (also the shape stored in qa_questions)
// ---------------------------------------------------------------------------

export interface Citation {
  n: number;
  manualId: string;
  manualTitle: string;
  page: number;
  section: string | null;
  quote: string;
}

export interface AnswerPart {
  text: string;
  citations: number[];
}

export interface ClosestSection {
  manualId: string;
  manualTitle: string;
  page: number;
  section: string | null;
}

export interface AnswerResult {
  id: string;
  question: string;
  found: boolean;
  parts: AnswerPart[];
  notFoundReason: string | null;
  citations: Citation[];
  warnings: Warning[];
  closest: ClosestSection[];
  costUsd: number;
  model: string | null;
}

export const NOT_FOUND_PREFIX = "NOT_FOUND";

export const SYSTEM_PROMPT = `You answer questions about a vehicle owner's own workshop manuals. The ONLY information you may use is the manual excerpts provided as search results. Each search result is a section of a manual; each text block in it is the text of one manual page.

Rules:
1. Every factual statement must come from the excerpts and be cited. Quote specifications — torque values, capacities, clearances, pressures, part numbers, fluid specs — exactly as printed, with their units. Never convert units or round.
2. If the excerpts do not contain the answer, reply with exactly one line: "${NOT_FOUND_PREFIX}: " followed by one short sentence describing what the excerpts do cover. Do not answer from general knowledge, do not estimate, and do not suggest typical values.
3. If a value depends on a variant (engine, model year, drivetrain, cab, axle type) and the excerpts list several, give each value with its condition, cited, and say which one matches the vehicle if the vehicle details make that clear.
4. If the excerpts answer only part of the question, answer that part and say plainly which part the manuals don't cover.
5. Be brief and practical: lead with the spec or the direct answer, then steps as a numbered list if needed. Don't add safety boilerplate the manual doesn't contain.`;

export interface AskDeps {
  /** The signed-in user's client: retrieval runs under their RLS. */
  db: SupabaseClient<Database>;
  /** Service-role client: writes the Q&A record and usage/cost events. */
  admin: SupabaseClient<Database>;
  embedder: Embedder;
  reranker: Reranker;
  llm: AnswerLlm;
}

export const RETRIEVE_CANDIDATES = 40;
export const CONTEXT_CHUNKS = 8;
/** Rerank scores below this are treated as unrelated; if all are, skip the model call. */
export const MIN_RERANK_SCORE = Number(process.env.RAG_MIN_RERANK_SCORE ?? 0.05);

type Candidate = Database["public"]["Functions"]["search_manual_chunks"]["Returns"][number];

function pagesLabel(start: number, end: number) {
  return start === end ? `p. ${start}` : `pp. ${start}–${end}`;
}

export async function askQuestion(
  args: { userId: string; vehicleId: string; question: string },
  deps: AskDeps,
): Promise<AnswerResult> {
  const started = Date.now();
  const question = args.question.trim().slice(0, 2000);
  const usages: { kind: Database["public"]["Enums"]["usage_kind"]; usage: Usage }[] = [];

  const { data: vehicle } = await deps.db
    .from("vehicles")
    .select("year, make, model, trim, engine")
    .eq("id", args.vehicleId)
    .single();
  if (!vehicle) throw new Error("Vehicle not found.");
  const vehicleText = [
    [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "),
    vehicle.engine ? `engine: ${vehicle.engine}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // 1. Retrieve (hybrid, under the user's RLS).
  const q = await deps.embedder.embed([question], "query");
  usages.push({ kind: "embed_query", usage: q.usage });
  const { data: found, error } = await deps.db.rpc("search_manual_chunks", {
    p_vehicle_id: args.vehicleId,
    p_query_embedding: JSON.stringify(q.vectors[0]),
    p_query_text: question,
    p_limit: RETRIEVE_CANDIDATES,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  const candidates: Candidate[] = found ?? [];

  // 2. Rerank to the most relevant few.
  let context: Candidate[] = [];
  if (candidates.length) {
    const rr = await deps.reranker.rerank(
      question,
      candidates.map((c) => [c.manual_title, c.section_path, c.content].filter(Boolean).join("\n")),
      CONTEXT_CHUNKS,
    );
    usages.push({ kind: "rerank", usage: rr.usage });
    context = rr.results.filter((r) => r.score >= MIN_RERANK_SCORE).map((r) => candidates[r.index]);
  }

  const closest: ClosestSection[] = (context.length ? context : candidates).slice(0, 3).map((c) => ({
    manualId: c.manual_id,
    manualTitle: c.manual_title,
    page: c.page_start,
    section: c.section_path,
  }));

  let parts: AnswerPart[] = [];
  let citations: Citation[] = [];
  let warnings: Warning[] = [];
  let notFoundReason: string | null = null;
  let model: string | null = null;

  if (!candidates.length) {
    const { count } = await deps.db
      .from("manuals")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_id", args.vehicleId)
      .eq("status", "ready");
    notFoundReason = count
      ? "Nothing in this vehicle's manuals matched the question."
      : "This vehicle has no processed manuals yet. Upload one first.";
  } else if (!context.length) {
    notFoundReason = "Nothing in this vehicle's manuals looked relevant to the question.";
  } else {
    // 3. Ask Claude with citable search results: one text block per page.
    const results: SearchResultInput[] = context.map((c) => {
      const segs = c.segments as unknown as Segment[];
      return {
        source: `manual:${c.manual_id}#chunk:${c.id}`,
        title: `${c.manual_title}, ${pagesLabel(c.page_start, c.page_end)}${c.section_path ? ` — ${c.section_path}` : ""}`,
        blocks: segs.map((s) => s.text),
      };
    });
    const res = await deps.llm.generate({ system: SYSTEM_PROMPT, vehicle: vehicleText, question, results });
    usages.push({ kind: "answer", usage: res.usage });
    model = res.usage.model;

    const fullText = res.blocks.map((b) => b.text).join("").trim();
    const hasCitations = res.blocks.some((b) => b.citations.length);

    if (res.refused) {
      notFoundReason = "The model declined to answer this question.";
    } else if (fullText.startsWith(NOT_FOUND_PREFIX)) {
      notFoundReason = fullText.slice(NOT_FOUND_PREFIX.length).replace(/^[:\s]+/, "").trim() || null;
    } else if (!hasCitations) {
      // Uncited prose is never shown as an answer.
      notFoundReason = "The manuals didn't clearly answer this, so no answer is shown.";
    } else {
      // 4. Map citations to manual pages and number them.
      const byKey = new Map<string, Citation>();
      for (const block of res.blocks) {
        const nums: number[] = [];
        for (const cit of block.citations) {
          const chunk = context[cit.searchResultIndex];
          if (!chunk) continue; // citation to something we didn't send: ignore
          const segs = chunk.segments as unknown as Segment[];
          for (let i = cit.startBlock; i < Math.min(cit.endBlock, segs.length); i++) {
            const page = segs[i].page;
            const key = `${chunk.manual_id}:${page}`;
            let c = byKey.get(key);
            if (!c) {
              c = {
                n: byKey.size + 1,
                manualId: chunk.manual_id,
                manualTitle: chunk.manual_title,
                page,
                section: chunk.section_path,
                quote: segs[i].text.slice(0, 1200),
              };
              byKey.set(key, c);
            }
            if (!nums.includes(c.n)) nums.push(c.n);
          }
        }
        parts.push({ text: block.text, citations: nums });
      }
      citations = [...byKey.values()];
      warnings = checkAnswer(
        res.blocks.map((b) => ({
          text: b.text,
          citations: b.citations.filter((c) => context[c.searchResultIndex]),
        })),
      );
      if (!citations.length) {
        parts = [];
        notFoundReason = "The manuals didn't clearly answer this, so no answer is shown.";
      }
    }
  }

  const isFound = citations.length > 0;
  const answerText = isFound ? parts.map((p) => p.text).join("") : (notFoundReason ?? "");
  const totalCost = usages.reduce((s, u) => s + costUsd(u.usage.model, u.usage.inputTokens, u.usage.outputTokens), 0);

  // 5. Persist (service role, explicitly scoped to the user).
  const { data: row, error: insErr } = await deps.admin
    .from("qa_questions")
    .insert({
      user_id: args.userId,
      vehicle_id: args.vehicleId,
      question,
      found: isFound,
      answer: answerText,
      citations: { parts, citations, notFoundReason } as unknown as NonNullable<Json>,
      warnings: warnings as unknown as NonNullable<Json>,
      candidates: closest as unknown as NonNullable<Json>,
      model,
      cost_usd: totalCost,
      latency_ms: Date.now() - started,
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(`Failed to save the answer: ${insErr?.message}`);
  for (const u of usages) await recordUsage(deps.admin, { userId: args.userId, kind: u.kind, usage: u.usage, questionId: row.id });

  return {
    id: row.id,
    question,
    found: isFound,
    parts: isFound ? parts : [],
    notFoundReason: isFound ? null : notFoundReason,
    citations,
    warnings,
    closest,
    costUsd: totalCost,
    model,
  };
}
