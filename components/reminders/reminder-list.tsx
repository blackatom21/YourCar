"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteReminder } from "@/app/(app)/vehicles/[vehicleId]/reminders-actions";
import { formatDate, formatMileage } from "@/lib/format";
import { ReminderForm, type ReminderValues } from "./reminder-form";

export interface ReminderRow extends ReminderValues {
  id: string;
  status: "ok" | "due_soon" | "overdue" | "never_done";
  next_due_mileage: number | null;
  next_due_on: string | null;
  miles_remaining: number | null;
  days_remaining: number | null;
}

const statusStyle: Record<ReminderRow["status"], { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  due_soon: { label: "Due soon", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  ok: { label: "OK", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  never_done: { label: "No record", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

function describe(r: ReminderRow, unit: string) {
  const parts: string[] = [];
  if (r.miles_remaining != null) {
    parts.push(
      r.miles_remaining < 0
        ? `${formatMileage(-r.miles_remaining, unit)} over`
        : `${formatMileage(r.miles_remaining, unit)} left (at ${formatMileage(r.next_due_mileage, unit)})`,
    );
  }
  if (r.days_remaining != null) {
    parts.push(
      r.days_remaining < 0
        ? `${-r.days_remaining} days late`
        : `${r.days_remaining} days left (${formatDate(r.next_due_on)})`,
    );
  }
  if (!parts.length) parts.push("Log it once to start tracking");
  return parts.join(" · ");
}

function interval(r: ReminderRow, unit: string) {
  return [r.interval_miles && `every ${formatMileage(r.interval_miles, unit)}`, r.interval_months && `${r.interval_months} mo`]
    .filter(Boolean)
    .join(" or ");
}

export function ReminderList({
  vehicleId,
  reminders,
  distanceUnit,
}: {
  vehicleId: string;
  reminders: ReminderRow[];
  distanceUnit: string;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reminders</h2>
        {editing !== "new" && (
          <button onClick={() => setEditing("new")} className="min-h-11 px-2 text-sm font-medium text-amber-600">
            + Add
          </button>
        )}
      </div>
      {editing === "new" && (
        <ReminderForm vehicleId={vehicleId} distanceUnit={distanceUnit} onDone={() => setEditing(null)} />
      )}
      {reminders.length === 0 && editing !== "new" && (
        <p className="text-sm text-zinc-500">No reminders yet. Add one for oil changes, tire rotations, and so on.</p>
      )}
      <ul className="flex flex-col gap-2">
        {reminders.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <ReminderForm vehicleId={vehicleId} initial={r} distanceUnit={distanceUnit} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[r.status].className}`}>
                      {statusStyle[r.status].label}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500">{describe(r, distanceUnit)}</div>
                  <div className="text-xs text-zinc-400">{interval(r, distanceUnit)}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-1 text-sm">
                <Link
                  href={`/vehicles/${vehicleId}/jobs/new?reminder=${r.id}`}
                  className="flex min-h-11 items-center rounded-lg px-3 font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                >
                  Log it done
                </Link>
                <button onClick={() => setEditing(r.id)} className="min-h-11 rounded-lg px-3 text-zinc-600 dark:text-zinc-400">
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete reminder “${r.title}”?`)) deleteReminder(vehicleId, r.id);
                  }}
                  className="min-h-11 rounded-lg px-3 text-zinc-600 dark:text-zinc-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
