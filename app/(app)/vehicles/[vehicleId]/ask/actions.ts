"use server";

import { z } from "zod";
import type { ActionResult } from "../../actions";
import { askQuestion, type AnswerResult } from "@/lib/rag/answer";
import { getProviders } from "@/lib/rag/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export async function ask(vehicleId: string, question: string): Promise<ActionResult<AnswerResult>> {
  const parsed = z.string().trim().min(3, "Ask a full question.").max(2000).safeParse(question);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();

  const { embedder, reranker } = await getProviders();
  const llm =
    process.env.RAG_PROVIDERS === "fake"
      ? (await import("@/lib/rag/fake-answer")).fakeAnswerLlm
      : (await import("@/lib/rag/claude-answer")).claudeAnswerLlm;

  try {
    const result = await askQuestion(
      { userId: user.id, vehicleId, question: parsed.data },
      { db: supabase, admin: createAdminClient(), embedder, reranker, llm },
    );
    return { ok: true, data: result };
  } catch (err) {
    console.error("ask failed", err);
    return { ok: false, error: "Something went wrong answering that. Please try again." };
  }
}
