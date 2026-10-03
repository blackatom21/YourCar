import { buildManualPdf } from "./manual-pdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/database.types";
import { fakeEmbedder, makeFakeOcr } from "@/lib/rag/fake";
import { ingestManual, inlineSteps } from "@/lib/rag/ingest";
import type { TestUser } from "./supabase";
/** A 6-page "manual": axle procedures with a torque table, an engine section, and one scanned page. */
export function tacomaManualPdf() {
  return buildManualPdf([
    {
      heading: "REAR AXLE",
      subheading: "Differential Oil Replacement",
      lines: [
        "1. Remove the rear differential filler plug and gasket.",
        "2. Remove the drain plug and gasket and drain the oil.",
        "3. Install the drain plug with a new gasket.",
        "Torque: 49 N*m (500 kgf*cm, 36 ft*lbf)",
        "4. Fill with hypoid gear oil API GL-5 SAE 75W-85.",
        "Standard capacity: 2.65 liters (2.80 US qts)",
      ],
    },
    {
      lines: [
        "5. Install the filler plug with a new gasket.",
        "Torque: 49 N*m (500 kgf*cm, 36 ft*lbf)",
        "Check for leaks after a short test drive.",
      ],
    },
    {
      heading: "ENGINE",
      subheading: "Engine Oil Replacement",
      lines: [
        "1. Remove the oil drain plug and gasket and drain the engine oil.",
        "2. Install a new gasket and the drain plug.",
        "Torque: 40 N*m (408 kgf*cm, 30 ft*lbf)",
        "Oil capacity with filter: 5.7 liters (6.0 US qts)",
      ],
    },
    { scanned: true },
    {
      heading: "BRAKES",
      subheading: "Front Brake Pads",
      lines: ["Minimum pad thickness: 1.0 mm (0.039 in.)", "Caliper bracket bolt torque: 123 N*m (1250 kgf*cm, 91 ft*lbf)"],
    },
    {
      lines: ["Bleed the brake system after replacing calipers.", "Use only SAE J1703 or FMVSS No. 116 DOT 3 fluid."],
    },
  ]);
}


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
