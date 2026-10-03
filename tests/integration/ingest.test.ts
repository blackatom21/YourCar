/**
 * Manual ingestion end to end against the local database, with deterministic
 * fake AI providers: storage → extraction → OCR of the scanned page → chunks
 * with page numbers and section paths → embeddings → usage/cost records.
 * Also checks that none of it is visible to another user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { fakeEmbedder, fakeVector, makeFakeOcr } from "@/lib/rag/fake";
import { ingestManual, inlineSteps, markIngestFailed } from "@/lib/rag/ingest";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../helpers/supabase";
import { tacomaManualPdf } from "../helpers/rag-fixtures";

let a: TestUser;
let b: TestUser;
let vehicleId: string;
let manualId: string;
const admin = adminClient() as unknown as SupabaseClient<Database>;

const ocrText = "# TRANSFER CASE\n\n## Transfer Case Oil\n\n| Item | Torque |\n|---|---|\n| Drain plug | 37 N*m |\n| Filler plug | 37 N*m |";

async function createManual(user: TestUser, vehicle: string, pdf: Uint8Array, title = "Tacoma FSM") {
  const id = randomUUID();
  const storage_path = `${user.id}/${id}.pdf`;
  const ins = await user.client
    .from("manuals")
    .insert({ id, vehicle_id: vehicle, title, storage_path, size_bytes: pdf.length, original_filename: "fsm.pdf" });
  if (ins.error) throw ins.error;
  const up = await user.client.storage
    .from("manuals")
    .upload(storage_path, new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), { contentType: "application/pdf" });
  if (up.error) throw up.error;
  // The server action does this after a successful upload.
  await admin.from("manuals").update({ status: "queued" }).eq("id", id);
  return id;
}

beforeAll(async () => {
  a = await createTestUser("ingest-a");
  b = await createTestUser("ingest-b");
  const v = await a.client.from("vehicles").insert({ make: "Toyota", model: "Tacoma", year: 2019 }).select().single();
  vehicleId = v.data!.id;

  manualId = await createManual(a, vehicleId, await tacomaManualPdf());
  await ingestManual(manualId, inlineSteps, {
    db: admin,
    embedder: fakeEmbedder,
    ocr: makeFakeOcr(() => ocrText),
  });
}, 120_000);

afterAll(async () => {
  await admin.storage.from("manuals").remove([`${a.id}/${manualId}.pdf`]);
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe("ingestion", () => {
  it("marks the manual ready with page and chunk counts", async () => {
    const { data: m } = await a.client.from("manuals").select("*").eq("id", manualId).single();
    expect(m).toMatchObject({ status: "ready", page_count: 6, pages_done: 6, ocr_pages: 1, stage: null, error: null });
    expect(m!.chunk_count).toBeGreaterThan(0);
    expect(m!.processed_at).not.toBeNull();
  });

  it("stores every page, using OCR only for the scanned one", async () => {
    const { data: pages } = await a.client
      .from("manual_pages")
      .select("page_number, source, text")
      .eq("manual_id", manualId)
      .order("page_number");
    expect(pages!.map((p) => p.source)).toEqual(["text_layer", "text_layer", "text_layer", "ocr", "text_layer", "text_layer"]);
    expect(pages![3].text).toContain("Drain plug | 37 N*m");
    // Running header is stripped from page text.
    expect(pages![0].text).not.toContain("RM0000TEST");
  });

  it("produces chunks with correct pages, section paths, and embeddings", async () => {
    const { data: chunks } = await a.client
      .from("manual_chunks")
      .select("page_start, page_end, section_path, content, segments, embedding")
      .eq("manual_id", manualId)
      .order("chunk_index");

    const axle = chunks!.find((c) => c.content.includes("drain plug with a new gasket"))!;
    expect(axle.section_path).toBe("REAR AXLE > Differential Oil Replacement");
    expect(axle.page_start).toBe(1);
    expect(axle.page_end).toBe(2); // the section continues onto page 2
    const segs = axle.segments as { page: number; text: string }[];
    expect(segs.map((s) => s.page)).toEqual([1, 2]);
    expect(segs[0].text).toContain("49 N*m");

    const engine = chunks!.find((c) => c.content.includes("40 N*m"))!;
    expect(engine.section_path).toBe("ENGINE > Engine Oil Replacement");
    expect(engine.page_start).toBe(3);

    const scanned = chunks!.find((c) => c.content.includes("37 N*m"))!;
    expect(scanned.page_start).toBe(4);
    expect(scanned.section_path).toBe("TRANSFER CASE > Transfer Case Oil");

    expect(chunks!.every((c) => c.embedding !== null)).toBe(true);
  });

  it("records usage events for OCR and embeddings, owned by the uploader", async () => {
    const { data: events } = await a.client.from("usage_events").select("kind, user_id, pages").eq("manual_id", manualId);
    const kinds = events!.map((e) => e.kind);
    expect(kinds).toContain("ocr");
    expect(kinds).toContain("embed_document");
    expect(events!.every((e) => e.user_id === a.id)).toBe(true);
    expect(events!.find((e) => e.kind === "ocr")!.pages).toBe(1);
  });

  it("finds the right chunk with hybrid search", async () => {
    const q = "rear differential drain plug torque";
    const { data, error } = await a.client.rpc("search_manual_chunks", {
      p_vehicle_id: vehicleId,
      p_query_embedding: JSON.stringify(fakeVector(q)),
      p_query_text: q,
      p_limit: 5,
    });
    expect(error).toBeNull();
    expect(data![0].content).toContain("49 N*m");
    expect(data![0].manual_title).toBe("Tacoma FSM");
    expect(data![0].text_rank).not.toBeNull();
    expect(data![0].vector_rank).not.toBeNull();
  });

  it("is restartable: re-running ingestion replaces, not duplicates", async () => {
    const before = await admin.from("manual_chunks").select("id", { count: "exact", head: true }).eq("manual_id", manualId);
    await ingestManual(manualId, inlineSteps, { db: admin, embedder: fakeEmbedder, ocr: makeFakeOcr(() => ocrText) });
    const after = await admin.from("manual_chunks").select("id", { count: "exact", head: true }).eq("manual_id", manualId);
    expect(after.count).toBe(before.count);
  });
});

describe("ingestion failures", () => {
  it("rejects a non-PDF file and records a readable error", async () => {
    const id = randomUUID();
    const path = `${a.id}/${id}.pdf`;
    await a.client.from("manuals").insert({ id, vehicle_id: vehicleId, title: "Bogus", storage_path: path });
    // Bucket only accepts application/pdf; lie about the type with the admin client to simulate a bad file.
    const up = await admin.storage
      .from("manuals")
      .upload(path, new Blob(["<html>not a pdf</html>"], { type: "application/pdf" }), { contentType: "application/pdf" });
    expect(up.error?.message ?? null).toBeNull();
    try {
      await ingestManual(id, inlineSteps, { db: admin, embedder: fakeEmbedder, ocr: makeFakeOcr() });
      throw new Error("expected ingestion to fail");
    } catch (err) {
      await markIngestFailed(admin, id, err);
    }
    const { data: m } = await a.client.from("manuals").select("status, error").eq("id", id).single();
    expect(m).toEqual({ status: "failed", error: "This file isn't a PDF." });
    await admin.storage.from("manuals").remove([path]);
  });
});

describe("isolation of manuals and derived data", () => {
  it("other user sees no manual, pages, chunks, or usage", async () => {
    for (const table of ["manuals", "manual_pages", "manual_chunks", "usage_events"] as const) {
      const { data } = await b.client.from(table).select("user_id");
      expect(data?.some((r) => r.user_id === a.id), table).toBe(false);
    }
  });

  it("other user's search over the owner's vehicle returns nothing", async () => {
    const q = "drain plug torque";
    const { data } = await b.client.rpc("search_manual_chunks", {
      p_vehicle_id: vehicleId,
      p_query_embedding: JSON.stringify(fakeVector(q)),
      p_query_text: q,
      p_limit: 10,
    });
    expect(data ?? []).toHaveLength(0);
  });

  it("other user cannot download the PDF or get a signed URL", async () => {
    const path = `${a.id}/${manualId}.pdf`;
    const dl = await b.client.storage.from("manuals").download(path);
    expect(dl.data).toBeNull();
    const signed = await b.client.storage.from("manuals").createSignedUrl(path, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
  });

  it("owner can download their own PDF (positive control)", async () => {
    const dl = await a.client.storage.from("manuals").download(`${a.id}/${manualId}.pdf`);
    expect(dl.data).not.toBeNull();
  });

  it("users cannot forge status, cost, chunks, or usage records", async () => {
    const status = await a.client.from("manuals").update({ status: "ready", ingest_cost_usd: 0 }).eq("id", manualId);
    expect(status.error).not.toBeNull();
    const chunk = await a.client.from("manual_chunks").insert({
      manual_id: manualId,
      user_id: a.id,
      vehicle_id: vehicleId,
      chunk_index: 999,
      page_start: 1,
      page_end: 1,
      content: "Torque: 1 N*m",
      segments: [],
    });
    expect(chunk.error).not.toBeNull();
    const usage = await a.client
      .from("usage_events")
      .insert({ user_id: a.id, kind: "answer", provider: "x", model: "x", cost_usd: 0 });
    expect(usage.error).not.toBeNull();
  });

  it("other user cannot rename, delete, or attach the owner's manual to a job", async () => {
    await b.client.from("manuals").update({ title: "pwned" }).eq("id", manualId);
    await b.client.from("manuals").delete().eq("id", manualId);
    const { data: m } = await admin.from("manuals").select("title").eq("id", manualId).single();
    expect(m!.title).toBe("Tacoma FSM");

    const bv = await b.client.from("vehicles").insert({ make: "Ford", model: "Ranger" }).select().single();
    const bj = await b.client.from("jobs").insert({ vehicle_id: bv.data!.id, type: "repair", title: "x" }).select().single();
    const ref = await b.client.from("job_manual_refs").insert({ job_id: bj.data!.id, manual_id: manualId, page: 1 });
    expect(ref.error).not.toBeNull();
  });

  it("other user cannot upload into a manual path they don't own", async () => {
    const up = await b.client.storage
      .from("manuals")
      .upload(`${a.id}/${randomUUID()}.pdf`, new Blob(["%PDF-1.4"], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    expect(up.error).not.toBeNull();
  });

  it("nobody can upload to an arbitrary path without a matching 'uploading' manual row", async () => {
    const up = await a.client.storage
      .from("manuals")
      .upload(`${a.id}/${randomUUID()}.pdf`, new Blob(["%PDF-1.4"], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    expect(up.error).not.toBeNull();
  });
});
