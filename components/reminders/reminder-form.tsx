"use client";

import { useActionState, useEffect } from "react";
import { saveReminder } from "@/app/(app)/vehicles/[vehicleId]/reminders-actions";
import { SubmitButton } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

export interface ReminderValues {
  id: string | null;
  title: string;
  interval_miles: number | null;
  interval_months: number | null;
  last_done_mileage: number | null;
  last_done_on: string | null;
}

export function ReminderForm({
  vehicleId,
  initial,
  distanceUnit,
  onDone,
}: {
  vehicleId: string;
  initial?: ReminderValues;
  distanceUnit: string;
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveReminder.bind(null, vehicleId, initial?.id ?? null), undefined);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <Field label="What">
        <Input name="title" defaultValue={initial?.title} required maxLength={120} placeholder="Oil change" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Every (${distanceUnit})`}>
          <Input name="interval_miles" defaultValue={initial?.interval_miles ?? ""} inputMode="numeric" placeholder="5000" />
        </Field>
        <Field label="…or every (months)">
          <Input name="interval_months" defaultValue={initial?.interval_months ?? ""} inputMode="numeric" placeholder="6" />
        </Field>
      </div>
      <p className="-mt-1 text-xs text-zinc-500">Whichever comes first. Leave one blank to use only the other.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Last done at (${distanceUnit})`}>
          <Input name="last_done_mileage" defaultValue={initial?.last_done_mileage ?? ""} inputMode="numeric" />
        </Field>
        <Field label="Last done on">
          <Input name="last_done_on" type="date" defaultValue={initial?.last_done_on ?? ""} />
        </Field>
      </div>
      <FormError message={state && !state.ok ? state.error : null} />
      <div className="flex gap-2">
        <SubmitButton className="flex-1">Save reminder</SubmitButton>
        <button type="button" onClick={onDone} className="min-h-12 px-4 text-sm text-zinc-500">
          Cancel
        </button>
      </div>
    </form>
  );
}
