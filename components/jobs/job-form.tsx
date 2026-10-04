"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addJobPhotos, deleteJobPhoto, saveJob } from "@/app/(app)/vehicles/[vehicleId]/jobs/actions";
import { PhotoPicker } from "@/components/photo-picker";
import { buttonClass } from "@/components/ui/button-styles";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { centsToInput, formatMoney, parseLaborMinutes, parseMoneyToCents } from "@/lib/format";
import { uploadPhotos } from "@/lib/upload";
import { jobTypes, type JobType } from "@/lib/validation";
import { parseYouTubeUrl } from "@/lib/youtube";

export interface PartRow {
  name: string;
  part_number: string;
  quantity: string;
  unit_cost: string;
}

export interface JobFormValues {
  id: string | null;
  type: JobType;
  title: string;
  performed_on: string;
  mileage: string;
  description: string;
  labor: string;
  total_cost_is_manual: boolean;
  total_cost: string;
  reminder_id: string;
  parts: PartRow[];
  videos: string[];
}

export interface ExistingPhoto {
  id: string;
  url: string | null;
}

const emptyPart: PartRow = { name: "", part_number: "", quantity: "1", unit_cost: "" };

function localToday() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the user's time zone
}

export function JobForm({
  userId,
  vehicleId,
  initial,
  reminders,
  existingPhotos = [],
  distanceUnit,
  currency,
  mileageHint,
}: {
  userId: string;
  vehicleId: string;
  initial: JobFormValues;
  reminders: { id: string; title: string }[];
  existingPhotos?: ExistingPhoto[];
  distanceUnit: string;
  currency: string;
  mileageHint?: number;
}) {
  const router = useRouter();
  // Default the date to "today" in the user's own time zone (the server can't know it).
  const [v, setV] = useState(() => ({ ...initial, performed_on: initial.performed_on || localToday() }));
  const [photos, setPhotos] = useState<File[]>([]);
  const [existing, setExisting] = useState(existingPhotos);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set =
    <K extends keyof JobFormValues>(key: K) =>
    (e: { target: { value: string } }) =>
      setV((cur) => ({ ...cur, [key]: e.target.value }));

  const partsTotalCents = useMemo(
    () =>
      v.parts.reduce((sum, p) => {
        const cost = parseMoneyToCents(p.unit_cost);
        const qty = Number(p.quantity);
        return sum + (Number.isFinite(cost) && cost && qty > 0 ? Math.round(cost * qty) : 0);
      }, 0),
    [v.parts],
  );

  function updatePart(i: number, key: keyof PartRow, value: string) {
    setV((cur) => ({ ...cur, parts: cur.parts.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));
  }

  function buildInput() {
    const parts = v.parts
      .filter((p) => p.name.trim() || p.part_number.trim() || p.unit_cost.trim())
      .map((p, i) => {
        const cents = parseMoneyToCents(p.unit_cost);
        if (Number.isNaN(cents)) throw new Error(`Part ${i + 1}: cost must be a number like 12.99.`);
        return { name: p.name, part_number: p.part_number, quantity: Number(p.quantity || 1), unit_cost_cents: cents ?? 0 };
      });

    const videos = v.videos
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => {
        const ref = parseYouTubeUrl(url);
        if (!ref) throw new Error(`"${url}" isn't a YouTube video link.`);
        return { youtube_video_id: ref.videoId, start_seconds: ref.startSeconds, original_url: url, title: null };
      });

    const labor = parseLaborMinutes(v.labor);
    if (Number.isNaN(labor)) throw new Error('Labor time: use minutes ("90"), "1:30", or "1h 30m".');

    const manualTotal = v.total_cost_is_manual ? parseMoneyToCents(v.total_cost) : null;
    if (Number.isNaN(manualTotal)) throw new Error("Total cost must be a number like 149.99.");

    return {
      id: v.id,
      vehicle_id: vehicleId,
      type: v.type,
      title: v.title,
      performed_on: v.performed_on,
      mileage: v.mileage.replace(/,/g, ""),
      description: v.description,
      labor_minutes: labor,
      total_cost_is_manual: v.total_cost_is_manual,
      total_cost_cents: manualTotal ?? 0,
      reminder_id: v.reminder_id || null,
      parts,
      videos,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let input;
    try {
      input = buildInput();
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    startTransition(async () => {
      setStatus("Saving…");
      const res = await saveJob(input);
      if (!res.ok) {
        setError(res.error);
        setStatus(null);
        return;
      }
      const jobId = res.data.id;
      if (photos.length) {
        try {
          const uploaded = await uploadPhotos("job-photos", `${userId}/${jobId}`, photos, (done, total) =>
            setStatus(`Uploading photos ${done}/${total}…`),
          );
          const attach = await addJobPhotos(jobId, uploaded);
          if (!attach.ok) throw new Error(attach.error);
        } catch (err) {
          setError(`Job saved, but photos failed: ${(err as Error).message} You can add them again from Edit.`);
          setStatus(null);
          setV((cur) => ({ ...cur, id: jobId }));
          return;
        }
      }
      router.push(`/vehicles/${vehicleId}/jobs/${jobId}`);
      router.refresh();
    });
  }

  function removeExisting(photoId: string) {
    if (!confirm("Delete this photo?")) return;
    startTransition(async () => {
      const res = await deleteJobPhoto(photoId);
      if (res.ok) setExisting((cur) => cur.filter((p) => p.id !== photoId));
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</legend>
        <div className="grid grid-cols-3 gap-2">
          {jobTypes.map((t) => (
            <label
              key={t}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium capitalize ${
                v.type === t
                  ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={v.type === t}
                onChange={() => setV((cur) => ({ ...cur, type: t }))}
                className="sr-only"
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Title *">
        <Input value={v.title} onChange={set("title")} required maxLength={200} placeholder="Oil & filter change" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date *">
          <Input type="date" value={v.performed_on} onChange={set("performed_on")} required suppressHydrationWarning />
        </Field>
        <Field label={`Mileage (${distanceUnit})`}>
          <Input value={v.mileage} onChange={set("mileage")} inputMode="numeric" placeholder={mileageHint ? `Odometer now: ${mileageHint.toLocaleString("en-US")}` : "52,300"} />
        </Field>
      </div>

      {reminders.length > 0 && (
        <Field label="Completes reminder" hint="Resets that reminder's countdown from this job.">
          <Select value={v.reminder_id} onChange={set("reminder_id")}>
            <option value="">— None —</option>
            {reminders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Notes / description">
        <Textarea value={v.description} onChange={set("description")} rows={5} maxLength={20000} />
      </Field>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Parts used</h2>
        {v.parts.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex gap-2">
              <Input
                aria-label={`Part ${i + 1} name`}
                placeholder="Part name"
                value={p.name}
                onChange={(e) => updatePart(i, "name", e.target.value)}
              />
              <button
                type="button"
                aria-label={`Remove part ${i + 1}`}
                onClick={() => setV((cur) => ({ ...cur, parts: cur.parts.filter((_, j) => j !== i) }))}
                className="min-h-12 min-w-12 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-[1fr_4.5rem_6.5rem] gap-2">
              <Input
                aria-label={`Part ${i + 1} number`}
                placeholder="Part #"
                value={p.part_number}
                onChange={(e) => updatePart(i, "part_number", e.target.value)}
                className="font-mono"
              />
              <Input
                aria-label={`Part ${i + 1} quantity`}
                placeholder="Qty"
                inputMode="decimal"
                value={p.quantity}
                onChange={(e) => updatePart(i, "quantity", e.target.value)}
              />
              <Input
                aria-label={`Part ${i + 1} unit cost`}
                placeholder="Cost ea."
                inputMode="decimal"
                value={p.unit_cost}
                onChange={(e) => updatePart(i, "unit_cost", e.target.value)}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setV((cur) => ({ ...cur, parts: [...cur.parts, { ...emptyPart }] }))}
          className={buttonClass("secondary")}
        >
          + Add part
        </button>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Labor time" hint='e.g. "1h 30m" or "90"'>
          <Input value={v.labor} onChange={set("labor")} placeholder="1h 30m" />
        </Field>
        <Field
          label="Total cost"
          hint={
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={v.total_cost_is_manual}
                onChange={(e) =>
                  setV((cur) => ({
                    ...cur,
                    total_cost_is_manual: e.target.checked,
                    total_cost: e.target.checked ? centsToInput(partsTotalCents) : "",
                  }))
                }
              />
              Enter manually
            </label>
          }
        >
          {v.total_cost_is_manual ? (
            <Input value={v.total_cost} onChange={set("total_cost")} inputMode="decimal" />
          ) : (
            <div className="rounded-lg bg-zinc-100 px-3 py-3 text-base dark:bg-zinc-800">
              {formatMoney(partsTotalCents, currency)}
            </div>
          )}
        </Field>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">YouTube videos</h2>
        {v.videos.map((url, i) => {
          const invalid = url.trim() !== "" && !parseYouTubeUrl(url);
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Input
                  aria-label={`Video ${i + 1} link`}
                  type="url"
                  inputMode="url"
                  placeholder="https://youtu.be/…"
                  value={url}
                  aria-invalid={invalid}
                  onChange={(e) =>
                    setV((cur) => ({ ...cur, videos: cur.videos.map((u, j) => (j === i ? e.target.value : u)) }))
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove video ${i + 1}`}
                  onClick={() => setV((cur) => ({ ...cur, videos: cur.videos.filter((_, j) => j !== i) }))}
                  className="min-h-12 min-w-12 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  ✕
                </button>
              </div>
              {invalid && <span className="text-xs text-red-600">Not a YouTube video link.</span>}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setV((cur) => ({ ...cur, videos: [...cur.videos, ""] }))}
          className={buttonClass("secondary")}
        >
          + Add YouTube link
        </button>
      </section>

      {existing.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Current photos</h2>
          <ul className="grid grid-cols-3 gap-2">
            {existing.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  aria-label="Delete photo"
                  onClick={() => removeExisting(p.id)}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PhotoPicker onChange={setPhotos} label={existing.length ? "Add photos" : "Photos"} />

      <FormError message={error} />
      <button type="submit" disabled={pending} className={`${buttonClass()} sticky bottom-3 shadow-lg`}>
        {status ?? (v.id ? "Save changes" : "Save job")}
      </button>
    </form>
  );
}
