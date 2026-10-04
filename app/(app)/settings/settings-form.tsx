"use client";

import { useActionState } from "react";
import { saveSettings } from "./actions";
import { SubmitButton } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "MXN", "JPY", "CHF", "SEK", "NOK", "DKK", "ZAR"];

export function SettingsForm({
  initial,
}: {
  initial: { display_name: string | null; distance_unit: string; currency: string };
}) {
  const [state, action] = useActionState(saveSettings, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Display name">
        <Input name="display_name" defaultValue={initial.display_name ?? ""} maxLength={100} />
      </Field>
      <Field label="Distance unit" hint="Odometer readings are stored as entered; this only changes the label.">
        <Select name="distance_unit" defaultValue={initial.distance_unit}>
          <option value="mi">Miles (mi)</option>
          <option value="km">Kilometres (km)</option>
        </Select>
      </Field>
      <Field label="Currency">
        <Select name="currency" defaultValue={initial.currency}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <FormError message={state && !state.ok ? state.error : null} />
      {state?.ok && <p className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</p>}
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
