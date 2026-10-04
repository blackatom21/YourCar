/**
 * Manual Q&A pipeline against the local database: real hybrid retrieval over an
 * ingested manual, fake embedder/reranker, and scripted stand-ins for Claude
 * that reproduce each behaviour we must handle safely.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { askQuestion, type AnswerLlm, type SearchResultInput } from "@/lib/rag/answer";
import { fakeEmbedder, fakeReranker } from "@/lib/rag/fake";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../helpers/supabase";
import { tacomaManualPdf, uploadAndIngest } from "../helpers/rag-fixtures";

let a: TestUser;
let b: TestUser;
let vehicleId: string;
let emptyVehicleId: string;
let manualId: string;
const admin = adminClient() as unknown as SupabaseClient<Database>;

/** Finds the (result, block) that contains `needle`. */
function locate(results: SearchResultInput[], needle: string) {
  for (const [ri, r] of results.entries()) {
    const bi = r.blocks.findIndex((t) => t.includes(needle));
    if (bi >= 0) return { ri, bi, text: r.blocks[bi] };
  }
  throw new Error(`"${needle}" was not in the retrieved context`);
}

const usage = { provider: "fake", model: "fake-llm", inputTokens: 100, outputTokens: 20 };

function scripted(
  respond: (results: SearchResultInput[]) => Awaited<ReturnType<AnswerLlm["generate"]>>["blocks"],
  refused = false,
): AnswerLlm & { calls: number } {
  const llm = {
    model: "fake-llm",
    calls: 0,
    async generate({ results }: { results: SearchResultInput[] }) {
      llm.calls++;
      return { blocks: respond(results), usage, refused };
    },
  };
  return llm;
}

function deps(user: TestUser, llm: AnswerLlm) {
  return { db: user.client as unknown as SupabaseClient<Database>, admin, embedder: fakeEmbedder, reranker: fakeReranker, llm };
}

beforeAll(async () => {
  a = await createTestUser("qa-a");
  b = await createTestUser("qa-b");
  const v = await a.client.from("vehicles").insert({ make: "Toyota", model: "Tacoma", year: 2019, engine: "3.5L V6" }).select().single();
  vehicleId = v.data!.id;
  const e = await a.client.from("vehicles").insert({ make: "Honda", model: "Civic" }).select().single();
  emptyVehicleId = e.data!.id;
  manualId = await uploadAndIngest(admin, a, vehicleId, await tacomaManualPdf());
}, 120_000);

afterAll(async () => {
  await admin.storage.from("manuals").remove([`${a.id}/${manualId}.pdf`]);
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe("grounded answers", () => {
  it("returns a cited answer that points at the manual and exact page", async () => {
    const llm = scripted((results) => {
      const hit = locate(results, "Install the filler plug");
      return [
        { text: "Install the filler plug with a new gasket and tighten it to 49 N·m (36 ft·lbf).", citations: [{ searchResultIndex: hit.ri, startBlock: hit.bi, endBlock: hit.bi + 1, citedText: hit.text }] },
      ];
    });
    const res = await askQuestion({ userId: a.id, vehicleId, question: "Rear differential filler plug torque?" }, deps(a, llm));

    expect(res.found).toBe(true);
    expect(res.citations).toHaveLength(1);
    expect(res.citations[0]).toMatchObject({ n: 1, manualId, manualTitle: "Tacoma FSM", page: 2 });
    expect(res.citations[0].section).toBe("REAR AXLE > Differential Oil Replacement");
    expect(res.citations[0].quote).toContain("49 N*m");
    expect(res.parts).toEqual([{ text: expect.stringContaining("49 N·m"), citations: [1] }]);
    expect(res.warnings).toEqual([]);
  });

  it("finds content that only exists on an OCR'd (scanned) page", async () => {
    const llm = scripted((results) => {
      const hit = locate(results, "37 N*m");
      return [{ text: "Transfer case drain plug: 37 N*m.", citations: [{ searchResultIndex: hit.ri, startBlock: hit.bi, endBlock: hit.bi + 1, citedText: hit.text }] }];
    });
    const res = await askQuestion({ userId: a.id, vehicleId, question: "transfer case drain plug torque" }, deps(a, llm));
    expect(res.found).toBe(true);
    expect(res.citations[0].page).toBe(4);
  });

  it("flags a number that doesn't appear in the cited text", async () => {
    const llm = scripted((results) => {
      const hit = locate(results, "Install the filler plug");
      return [{ text: "Tighten to 59 N·m.", citations: [{ searchResultIndex: hit.ri, startBlock: hit.bi, endBlock: hit.bi + 1, citedText: hit.text }] }];
    });
    const res = await askQuestion({ userId: a.id, vehicleId, question: "filler plug torque" }, deps(a, llm));
    expect(res.found).toBe(true);
    expect(res.warnings).toMatchObject([{ kind: "number_not_in_source", value: "59" }]);
  });
});

describe("not found", () => {
  it("reports the model's NOT_FOUND clearly, with closest sections to check", async () => {
    const llm = scripted(() => [{ text: "NOT_FOUND: The excerpts cover axle oil, engine oil, and brake pads, not spark plugs.", citations: [] }]);
    const res = await askQuestion({ userId: a.id, vehicleId, question: "Spark plug gap for the engine oil system?" }, deps(a, llm));
    expect(res.found).toBe(false);
    expect(res.parts).toEqual([]);
    expect(res.citations).toEqual([]);
    expect(res.notFoundReason).toBe("The excerpts cover axle oil, engine oil, and brake pads, not spark plugs.");
    expect(res.closest.length).toBeGreaterThan(0);
  });

  it("never shows an uncited answer (e.g. from general knowledge)", async () => {
    const llm = scripted(() => [{ text: "Spark plug gap is typically 1.1 mm for this engine.", citations: [] }]);
    const res = await askQuestion({ userId: a.id, vehicleId, question: "spark plug gap engine" }, deps(a, llm));
    expect(res.found).toBe(false);
    expect(res.parts).toEqual([]);
    expect(JSON.stringify(res)).not.toContain("1.1 mm");
  });

  it("ignores citations to search results that were never sent", async () => {
    const llm = scripted(() => [{ text: "It's 49 N·m.", citations: [{ searchResultIndex: 99, startBlock: 0, endBlock: 1, citedText: "49 N*m" }] }]);
    const res = await askQuestion({ userId: a.id, vehicleId, question: "drain plug torque" }, deps(a, llm));
    expect(res.found).toBe(false);
  });

  it("treats a model refusal as not found", async () => {
    const llm = scripted(() => [], true);
    const res = await askQuestion({ userId: a.id, vehicleId, question: "drain plug torque" }, deps(a, llm));
    expect(res.found).toBe(false);
    expect(res.notFoundReason).toMatch(/declined/);
  });

  it("doesn't call the model at all when the vehicle has no manuals", async () => {
    const llm = scripted(() => {
      throw new Error("should not be called");
    });
    const res = await askQuestion({ userId: a.id, vehicleId: emptyVehicleId, question: "drain plug torque" }, deps(a, llm));
    expect(llm.calls).toBe(0);
    expect(res.found).toBe(false);
    expect(res.notFoundReason).toMatch(/no processed manuals/);
  });

  it("doesn't call the model when nothing retrieved is relevant", async () => {
    const llm = scripted(() => {
      throw new Error("should not be called");
    });
    const res = await askQuestion({ userId: a.id, vehicleId, question: "zzzz qqqq xyzzy" }, deps(a, llm));
    expect(llm.calls).toBe(0);
    expect(res.found).toBe(false);
  });
});

describe("records, cost, and isolation", () => {
  it("stores the Q&A record and usage events for the asking user only", async () => {
    const llm = scripted((results) => {
      const hit = locate(results, "40 N*m");
      return [{ text: "Engine oil drain plug: 40 N*m.", citations: [{ searchResultIndex: hit.ri, startBlock: hit.bi, endBlock: hit.bi + 1, citedText: hit.text }] }];
    });
    const res = await askQuestion({ userId: a.id, vehicleId, question: "engine oil drain plug torque" }, deps(a, llm));

    const { data: q } = await a.client.from("qa_questions").select("*").eq("id", res.id).single();
    expect(q).toMatchObject({ found: true, user_id: a.id, vehicle_id: vehicleId });
    const { data: events } = await a.client.from("usage_events").select("kind").eq("question_id", res.id);
    expect(events!.map((e) => e.kind).sort()).toEqual(["answer", "embed_query", "rerank"]);

    const other = await b.client.from("qa_questions").select("id").eq("id", res.id);
    expect(other.data).toHaveLength(0);
  });

  it("another user cannot query the owner's vehicle (retrieval runs under their RLS)", async () => {
    const llm = scripted(() => {
      throw new Error("should not be called");
    });
    await expect(askQuestion({ userId: b.id, vehicleId, question: "drain plug torque" }, deps(b, llm))).rejects.toThrow(
      /Vehicle not found/,
    );
    expect(llm.calls).toBe(0);
  });

  it("another user's own vehicle never retrieves the owner's chunks", async () => {
    const bv = await b.client.from("vehicles").insert({ make: "Toyota", model: "Tacoma" }).select().single();
    const spy = vi.fn();
    const llm = scripted((results) => {
      spy(results);
      return [{ text: "NOT_FOUND: nothing", citations: [] }];
    });
    const res = await askQuestion({ userId: b.id, vehicleId: bv.data!.id, question: "rear differential drain plug torque" }, deps(b, llm));
    expect(spy).not.toHaveBeenCalled();
    expect(res.found).toBe(false);
    expect(res.closest).toEqual([]);
  });
});
