/**
 * Live evaluation of manual Q&A against a REAL uploaded manual, using the real
 * providers (Voyage + Claude). Costs money — each case is one real question.
 *
 *   npm run eval:manuals -- scripts/eval-cases.example.json
 *
 * Case file:
 * {
 *   "userId": "...", "vehicleId": "...",
 *   "cases": [
 *     { "question": "Rear axle drain plug torque?", "expect": "found",
 *       "mustContain": ["49"], "pages": [412] },
 *     { "question": "Spark plug gap?", "expect": "not_found" }
 *   ]
 * }
 *
 * A "found" case passes when the answer is found, every mustContain string
 * appears in the answer, at least one citation is on an expected page (if
 * given), and there are no numeric-verification warnings.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

interface Case {
  question: string;
  expect: "found" | "not_found";
  mustContain?: string[];
  pages?: number[];
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: eval-manuals.ts <cases.json>");
  const spec = JSON.parse(readFileSync(file, "utf8")) as { userId: string; vehicleId: string; cases: Case[] };

  const { askQuestion } = await import("../lib/rag/answer");
  const { voyageEmbedder, voyageReranker } = await import("../lib/rag/voyage");
  const { claudeAnswerLlm } = await import("../lib/rag/claude-answer");
  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });

  let passed = 0;
  let cost = 0;
  for (const c of spec.cases) {
    const res = await askQuestion(
      { userId: spec.userId, vehicleId: spec.vehicleId, question: c.question },
      // Service role for retrieval too: this is the owner evaluating their own vehicle.
      { db: admin, admin, embedder: voyageEmbedder, reranker: voyageReranker, llm: claudeAnswerLlm },
    );
    cost += res.costUsd;
    const text = res.parts.map((p) => p.text).join("");
    const problems: string[] = [];
    if (c.expect === "not_found") {
      if (res.found) problems.push("expected NOT FOUND but got an answer");
    } else {
      if (!res.found) problems.push(`expected an answer, got not found (${res.notFoundReason})`);
      for (const s of c.mustContain ?? []) if (!text.includes(s)) problems.push(`answer lacks "${s}"`);
      if (c.pages?.length && !res.citations.some((x) => c.pages!.includes(x.page))) {
        problems.push(`cited pages ${res.citations.map((x) => x.page).join(",")} not in expected ${c.pages.join(",")}`);
      }
      if (res.warnings.length) problems.push(`warnings: ${res.warnings.map((w) => w.value).join(", ")}`);
    }
    if (!problems.length) passed++;
    console.log(`${problems.length ? "FAIL" : "PASS"}  ${c.question}`);
    for (const p of problems) console.log(`      - ${p}`);
    if (res.found) console.log(`      → ${text.slice(0, 200).replace(/\n/g, " ")}  [pages ${res.citations.map((x) => x.page).join(", ")}]`);
  }
  console.log(`\n${passed}/${spec.cases.length} passed · total cost ≈ $${cost.toFixed(4)}`);
  process.exit(passed === spec.cases.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
