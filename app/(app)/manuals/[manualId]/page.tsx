import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PdfViewer } from "@/components/manuals/pdf-viewer";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Manual" };

export default async function ManualViewerPage({ params, searchParams }: PageProps<"/manuals/[manualId]">) {
  const { manualId } = await params;
  const { page } = await searchParams;
  const { supabase } = await requireUser();
  const { data: manual } = await supabase
    .from("manuals")
    .select("id, title, vehicle_id, storage_path, page_count")
    .eq("id", manualId)
    .maybeSingle();
  if (!manual) notFound();

  const { data: signed } = await supabase.storage.from("manuals").createSignedUrl(manual.storage_path, 60 * 60);
  if (!signed?.signedUrl) notFound();
  const initial = Math.max(1, Number(typeof page === "string" ? page : 1) || 1);

  return (
    <section className="flex flex-col gap-3">
      <Link href={`/vehicles/${manual.vehicle_id}/manuals`} className="text-sm text-zinc-500">
        ← Manuals
      </Link>
      <h1 className="text-xl font-bold">{manual.title}</h1>
      <Suspense>
        <PdfViewer url={signed.signedUrl} initialPage={initial} pageCount={manual.page_count} />
      </Suspense>
    </section>
  );
}
