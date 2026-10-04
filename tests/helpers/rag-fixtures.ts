import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/database.types";
import { fakeEmbedder, makeFakeOcr } from "@/lib/rag/fake";
import { ingestManual, inlineSteps } from "@/lib/rag/ingest";
import { tacomaManualPdf } from "./manual-pdf";
import type { TestUser } from "./supabase";

export { tacomaManualPdf };

export const SCANNED_PAGE_MARKDOWN =
  "# TRANSFER CASE\n\n## Transfer Case Oil\n\n| Item | Torque |\n|---|---|\n| Drain plug | 37 N*m |\n| Filler plug | 37 N*m |";

/** Uploads a PDF as `user` and runs the full ingestion pipeline with fake providers. */
export async function uploadAndIngest(
  admin: SupabaseClient<Database>,
  user: TestUser,
  vehicleId: string,
  pdf: Uint8Array,
  title = "Tacoma FSM",
): Promise<string> {
  const id = randomUUID();
  const storage_path = `${user.id}/${id}.pdf`;
  const ins = await user.client
    .from("manuals")
    .insert({ id, vehicle_id: vehicleId, title, storage_path, size_bytes: pdf.length, original_filename: "fsm.pdf" });
  if (ins.error) throw ins.error;
  const up = await user.client.storage
    .from("manuals")
    .upload(storage_path, new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), {
      contentType: "application/pdf",
    });
  if (up.error) throw up.error;
  await admin.from("manuals").update({ status: "queued" }).eq("id", id);
  await ingestManual(id, inlineSteps, {
    db: admin,
    embedder: fakeEmbedder,
    ocr: makeFakeOcr(() => SCANNED_PAGE_MARKDOWN),
  });
  return id;
}
