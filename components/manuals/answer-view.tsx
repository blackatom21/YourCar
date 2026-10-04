"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { addJobManualRef } from "@/app/(app)/vehicles/[vehicleId]/jobs/manual-ref-actions";
import type { AnswerPart, Citation, ClosestSection } from "@/lib/rag/answer";
import { formatUsd } from "@/lib/rag/pricing";
import type { Warning } from "@/lib/rag/validate";

export interface AnswerViewData {
  question: string;
  found: boolean;
  parts: AnswerPart[];
  notFoundReason: string | null;
  citations: Citation[];
  warnings: Warning[];
  closest: ClosestSection[];
  costUsd: number;
}

export function viewerHref(manualId: string, page: number) {
  return `/manuals/${manualId}?page=${page}`;
}

/** Renders **bold** and keeps line breaks; everything else is plain text (no HTML injection). */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
        seg.startsWith("**") && seg.endsWith("**") ? <strong key={i}>{seg.slice(2, -2)}</strong> : <Fragment key={i}>{seg}</Fragment>,
      )}
    </>
  );
}

function SaveToJob({ citation, jobs }: { citation: Citation; jobs: { id: string; title: string }[] }) {
  const [jobId, setJobId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!jobs.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        aria-label={`Attach page ${citation.page} to a job`}
        value={jobId}
        onChange={(e) => setJobId(e.target.value)}
        className="min-h-10 max-w-[14rem] rounded-lg border border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">Attach to a job…</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.title}
          </option>
        ))}
      </select>
      <button
        disabled={!jobId || pending}
        onClick={() =>
          start(async () => {
            const res = await addJobManualRef({ jobId, manualId: citation.manualId, page: citation.page, label: citation.section ?? "" });
            setMsg(res.ok ? "Attached ✓" : res.error);
          })
        }
        className="min-h-10 rounded-lg px-3 font-medium text-amber-700 disabled:opacity-40 dark:text-amber-400"
      >
        Attach
      </button>
      {msg && <span className="text-zinc-500">{msg}</span>}
    </div>
  );
}

export function AnswerView({ data, jobs = [] }: { data: AnswerViewData; jobs?: { id: string; title: string }[] }) {
  return (
    <article className="flex flex-col gap-3">
      <p className="font-medium">{data.question}</p>

      {data.found ? (
        <>
          {data.warnings.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-semibold">⚠ Check the cited page before using these values</p>
              <ul className="mt-1 list-disc pl-5">
                {data.warnings.map((w, i) => (
                  <li key={i}>
                    {w.kind === "number_not_in_source"
                      ? `“${w.value}” doesn't appear word-for-word in the cited manual text.`
                      : `“${w.value}” has no citation to your manual.`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="whitespace-pre-wrap leading-relaxed">
            {data.parts.map((p, i) => (
              <Fragment key={i}>
                <RichText text={p.text} />
                {p.citations.map((n) => {
                  const c = data.citations.find((x) => x.n === n)!;
                  return (
                    <Link
                      key={n}
                      href={viewerHref(c.manualId, c.page)}
                      className="mx-0.5 inline-flex items-center rounded bg-amber-100 px-1.5 align-baseline text-xs font-semibold text-amber-900 no-underline dark:bg-amber-900 dark:text-amber-100"
                      title={`${c.manualTitle}, p. ${c.page}`}
                    >
                      {n}
                    </Link>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <ol className="flex flex-col gap-2">
            {data.citations.map((c) => (
              <li key={c.n} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <Link href={viewerHref(c.manualId, c.page)} className="font-medium text-amber-700 underline dark:text-amber-400">
                    [{c.n}] {c.manualTitle} · page {c.page} →
                  </Link>
                </div>
                {c.section && <div className="text-xs text-zinc-500">{c.section}</div>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-zinc-500">Show manual text</summary>
                  <p className="mt-1 whitespace-pre-wrap rounded bg-zinc-50 p-2 font-mono text-xs dark:bg-zinc-900">{c.quote}</p>
                </details>
                <SaveToJob citation={c} jobs={jobs} />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-semibold">Not found in your manuals</p>
          {data.notFoundReason && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{data.notFoundReason}</p>}
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            No answer is given from general knowledge — a wrong spec can hurt someone.
          </p>
          {data.closest.length > 0 && (
            <div className="mt-2 text-sm">
              <span className="text-zinc-500">Closest sections, if you want to look yourself:</span>
              <ul className="mt-1 flex flex-col gap-1">
                {data.closest.map((c, i) => (
                  <li key={i}>
                    <Link href={viewerHref(c.manualId, c.page)} className="text-amber-700 underline dark:text-amber-400">
                      {c.manualTitle} · p. {c.page}
                      {c.section ? ` — ${c.section}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-zinc-400">Cost of this question: {formatUsd(data.costUsd)}</p>
    </article>
  );
}
