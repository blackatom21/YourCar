import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualList, type ManualRow } from "@/components/manuals/manual-list";
import { ManualUploader } from "@/components/manuals/manual-uploader";
import { buttonClass } from "@/components/ui/button-styles";
import { vehicleName } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Manuals" };

export default async function ManualsPage({ params }: PageProps<"/vehicles/[vehicleId]/manuals">) {
  const { vehicleId } = await params;
  const { supabase } = await requireUser();
  const [{ data: vehicle }, { data: manuals }] = await Promise.all([
    supabase.from("vehicles").select("id, year, make, model, trim").eq("id", vehicleId).maybeSingle(),
    supabase
      .from("manuals")
      .select("id, title, status, stage, page_count, pages_done, ocr_pages, chunk_count, size_bytes, error, ingest_cost_usd, created_at")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false }),
  ]);
  if (!vehicle) notFound();
  const anyReady = manuals?.some((m) => m.status === "ready");

  return (
    <section className="flex flex-col gap-6">
      <Link href={`/vehicles/${vehicle.id}`} className="text-sm text-zinc-500">
        ← {vehicleName(vehicle)}
      </Link>
      <h1 className="text-2xl font-bold">Manuals</h1>
      {anyReady && (
        <Link href={`/vehicles/${vehicle.id}/ask`} className={buttonClass()}>
          Ask your manuals
        </Link>
      )}
      <ManualList manuals={(manuals ?? []) as ManualRow[]} />
      <ManualUploader vehicleId={vehicle.id} />
    </section>
  );
}
