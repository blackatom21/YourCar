"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addJobManualRef, deleteJobManualRef } from "@/app/(app)/vehicles/[vehicleId]/jobs/manual-ref-actions";
import { FormError, Input, Select } from "@/components/ui/form";

export interface ManualRef {
  id: string;
  page: number;
  label: string | null;
  manual: { id: string; title: string } | null;
}

export function ManualRefs({
  jobId,
  refs,
  manuals,
}: {
  jobId: string;
  refs: ManualRef[];
  manuals: { id: string; title: string; page_count: number | null }[];
}) {
  const [adding, setAdding] = useState(false);
  const [manualId, setManualId] = useState(manuals[0]?.id ?? "");
  const [page, setPage] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!refs.length && !manuals.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Manual pages</h2>
        {manuals.length > 0 && !adding && (
          <button onClick={() => setAdding(true)} className="min-h-11 px-2 text-sm font-medium text-amber-600">
            + Add
          </button>
        )}
      </div>
      {refs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {refs.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              {r.manual ? (
                <Link href={`/manuals/${r.manual.id}?page=${r.page}`} className="min-w-0 font-medium text-amber-700 underline dark:text-amber-400">
                  📖 {r.manual.title} · p. {r.page}
                  {r.label && <span className="block text-xs font-normal text-zinc-500 no-underline">{r.label}</span>}
                </Link>
              ) : (
                <span className="text-zinc-500">Deleted manual · p. {r.page}</span>
              )}
              <button
                aria-label="Remove reference"
                onClick={() => start(async () => void (await deleteJobManualRef(r.id)))}
                className="min-h-11 min-w-11 rounded-lg text-zinc-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form
          className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await addJobManualRef({ jobId, manualId, page: Number(page), label });
              if (!res.ok) return setError(res.error);
              setAdding(false);
              setPage("");
              setLabel("");
            });
          }}
        >
          <Select aria-label="Manual" value={manualId} onChange={(e) => setManualId(e.target.value)}>
            {manuals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input aria-label="Page" placeholder="Page" inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} required />
            <Input aria-label="Label" placeholder="e.g. Drain plug torque" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
          </div>
          <FormError message={error} />
          <div className="flex gap-2">
            <button disabled={pending} className="min-h-11 flex-1 rounded-lg bg-amber-500 font-semibold text-zinc-950">
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-3 text-sm text-zinc-500">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
