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

  const set = (key: keyof VehicleFormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      setStatus("Saving…");
      const res = await saveVehicle(vehicleId, values);
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
      <PhotoPicker onChange={setCover} multiple={false} label={vehicleId ? "Replace cover photo" : "Cover photo"} />
      <FormError message={error} />
      <button type="submit" disabled={pending} className={buttonClass()}>
        {status ?? (vehicleId ? "Save changes" : "Add vehicle")}
      </button>
    </form>
  );
}
