"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveVehicle, setVehicleCover } from "@/app/(app)/vehicles/actions";
import { PhotoPicker } from "@/components/photo-picker";
import { buttonClass } from "@/components/ui/button-styles";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { uploadPhotos } from "@/lib/upload";

export interface VehicleFormValues {
  year: string;
  make: string;
  model: string;
  trim: string;
  vin: string;
  engine: string;
  current_mileage: string;
  purchase_date: string;
  notes: string;
  specs: { label: string; value: string }[];
}

export function VehicleForm({
  userId,
  vehicleId,
  initial,
  distanceUnit,
}: {
  userId: string;
  vehicleId: string | null;
  initial: VehicleFormValues;
  distanceUnit: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [cover, setCover] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: Exclude<keyof VehicleFormValues, "specs">) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));
  const setSpec = (i: number, key: "label" | "value") => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, specs: v.specs.map((s, j) => (j === i ? { ...s, [key]: e.target.value } : s)) }));
  const addSpec = () => setValues((v) => ({ ...v, specs: [...v.specs, { label: "", value: "" }] }));
  const removeSpec = (i: number) => setValues((v) => ({ ...v, specs: v.specs.filter((_, j) => j !== i) }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      setStatus("Saving…");
      // Drop rows left completely empty; half-filled rows still fail validation.
      const specs = values.specs.filter((s) => s.label.trim() || s.value.trim());
      const res = await saveVehicle(vehicleId, { ...values, specs });
      if (!res.ok) {
        setError(res.error);
        setStatus(null);
        return;
      }
      const id = res.data.id;
      if (cover.length) {
        try {
          setStatus("Uploading photo…");
          const [photo] = await uploadPhotos("vehicle-photos", `${userId}/${id}`, cover);
          const coverRes = await setVehicleCover(id, photo.storage_path);
          if (!coverRes.ok) throw new Error(coverRes.error);
        } catch (err) {
          // The vehicle itself saved; continue on its edit page so a retry can't duplicate it.
          setStatus(null);
          if (vehicleId) {
            setError(`Changes saved, but the photo failed: ${(err as Error).message}`);
          } else {
            router.push(`/vehicles/${id}/edit?photoError=${encodeURIComponent((err as Error).message)}`);
          }
          return;
        }
      }
      router.push(`/vehicles/${id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Year">
          <Input value={values.year} onChange={set("year")} inputMode="numeric" maxLength={4} placeholder="2019" />
        </Field>
        <Field label="Make *">
          <Input value={values.make} onChange={set("make")} required maxLength={60} placeholder="Toyota" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model *">
          <Input value={values.model} onChange={set("model")} required maxLength={60} placeholder="Tacoma" />
        </Field>
        <Field label="Trim">
          <Input value={values.trim} onChange={set("trim")} maxLength={60} placeholder="TRD Off-Road" />
        </Field>
      </div>
      <Field label="Engine">
        <Input value={values.engine} onChange={set("engine")} maxLength={100} placeholder="3.5L V6 2GR-FKS" />
      </Field>
      <Field label="VIN">
        <Input
          value={values.vin}
          onChange={set("vin")}
          maxLength={17}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono uppercase"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Current mileage (${distanceUnit})`}>
          <Input value={values.current_mileage} onChange={set("current_mileage")} inputMode="numeric" />
        </Field>
        <Field label="Purchase date">
          <Input type="date" value={values.purchase_date} onChange={set("purchase_date")} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={values.notes} onChange={set("notes")} maxLength={10000} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Specs</legend>
        <p className="-mt-1 text-xs text-zinc-500">
          Fluids, capacities, part numbers, axle, tire size — anything you look up more than once.
        </p>
        {values.specs.map((spec, i) => (
          <div key={i} className="grid grid-cols-[2fr_3fr_auto] items-center gap-2">
            <Input
              value={spec.label}
              onChange={setSpec(i, "label")}
              maxLength={60}
              placeholder="Engine oil"
              aria-label={`Spec ${i + 1} label`}
            />
            <Input
              value={spec.value}
              onChange={setSpec(i, "value")}
              maxLength={300}
              placeholder="5W-30, 6.0 qt w/ filter"
              aria-label={`Spec ${i + 1} value`}
            />
            <button
              type="button"
              onClick={() => removeSpec(i)}
              className="min-h-11 px-2 text-sm text-zinc-500"
              aria-label={`Remove spec ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        {values.specs.length < 100 && (
          <button type="button" onClick={addSpec} className="min-h-11 self-start px-2 text-sm font-medium text-amber-600">
            + Add spec
          </button>
        )}
      </fieldset>
      <PhotoPicker onChange={setCover} multiple={false} label={vehicleId ? "Replace cover photo" : "Cover photo"} />
      <FormError message={error} />
      <button type="submit" disabled={pending} className={buttonClass()}>
        {status ?? (vehicleId ? "Save changes" : "Add vehicle")}
      </button>
    </form>
  );
}
