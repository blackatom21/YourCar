"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { deleteManual, retryManual } from "@/app/(app)/vehicles/[vehicleId]/manuals/actions";
import { formatUsd } from "@/lib/rag/pricing";

export interface ManualRow {
  id: string;
  title: string;
  status: "uploading" | "queued" | "processing" | "ready" | "failed";
  stage: string | null;
  page_count: number | null;
  pages_done: number;
  ocr_pages: number;
  chunk_count: number;
  size_bytes: number | null;
  error: string | null;
  ingest_cost_usd: number;
  created_at: string;
}

const STAGE_LABEL: Record<string, string> = {
  extracting: "Reading pages",
  ocr: "Reading scanned pages (OCR)",
  chunking: "Organising sections",
  embedding: "Indexing for search",
};

function StatusBadge({ m }: { m: ManualRow }) {
  const styles: Record<ManualRow["status"], string> = {
    uploading: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    queued: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    processing: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };
  const label = { uploading: "Upload incomplete", queued: "Queued", processing: "Processing", ready: "Ready", failed: "Failed" }[m.status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[m.status]}`}>{label}</span>;
}

export function ManualList({ manuals }: { manuals: ManualRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = manuals.some((m) => m.status === "queued" || m.status === "processing");

  // Poll while anything is processing so status/progress updates live.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  if (!manuals.length) return <p className="text-sm text-zinc-500">No manuals yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {manuals.map((m) => {
        const pct = m.page_count ? Math.round((Math.min(m.pages_done, m.page_count) / m.page_count) * 100) : 0;
        return (
          <li key={m.id} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {m.status === "ready" ? (
                  <Link href={`/manuals/${m.id}`} className="font-medium underline-offset-2 hover:underline">
                    {m.title}
                  </Link>
                ) : (
                  <span className="font-medium">{m.title}</span>
                )}
                <div className="text-xs text-zinc-500">
                  {[
                    m.page_count ? `${m.page_count} pages` : null,
                    m.ocr_pages ? `${m.ocr_pages} scanned` : null,
                    m.size_bytes ? `${(m.size_bytes / 1024 / 1024).toFixed(1)} MB` : null,
                    m.status === "ready" ? `processing cost ${formatUsd(m.ingest_cost_usd)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <StatusBadge m={m} />
            </div>

            {m.status === "processing" && (
              <div className="flex flex-col gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${m.stage === "extracting" ? pct : 100}%` }} />
                </div>
                <span className="text-xs text-zinc-500">
                  {STAGE_LABEL[m.stage ?? ""] ?? "Processing"}
                  {m.stage === "extracting" && m.page_count ? ` — ${m.pages_done}/${m.page_count} pages` : ""}
                </span>
              </div>
            )}
            {m.status === "failed" && <p className="text-sm text-red-700 dark:text-red-400">{m.error ?? "Processing failed."}</p>}

            <div className="flex gap-1 text-sm">
              {m.status === "failed" && (
                <button
                  disabled={pending}
                  onClick={() => start(async () => void (await retryManual(m.id)))}
                  className="min-h-11 rounded-lg px-3 font-medium text-amber-700 dark:text-amber-400"
                >
                  Retry
                </button>
              )}
              <button
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete “${m.title}” and its search index?`)) start(async () => void (await deleteManual(m.id)));
                }}
                className="min-h-11 rounded-lg px-3 text-zinc-600 dark:text-zinc-400"
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
