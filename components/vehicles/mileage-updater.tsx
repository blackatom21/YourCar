"use client";

import { useState, useTransition } from "react";
import { updateMileage } from "@/app/(app)/vehicles/actions";
import { formatMileage } from "@/lib/format";

export function MileageUpdater({ vehicleId, mileage, unit }: { vehicleId: string; mileage: number; unit: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(mileage));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="min-h-11 text-left" title="Update odometer">
        <span className="text-zinc-500">Odometer </span>
        <span className="font-semibold">{formatMileage(mileage, unit)}</span>
        <span className="ml-1 text-sm text-amber-600">✎</span>
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateMileage(vehicleId, Number(value.replace(/,/g, "")));
          if (res.ok) setEditing(false);
          else setError(res.error);
        });
      }}
    >
      <input
        autoFocus
        aria-label={`Odometer (${unit})`}
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-32 rounded-lg border border-zinc-300 px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900"
      />
      <span className="text-sm text-zinc-500">{unit}</span>
      <button disabled={pending} className="min-h-11 rounded-lg bg-amber-500 px-3 font-semibold text-zinc-950">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-2 text-sm text-zinc-500">
        Cancel
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
