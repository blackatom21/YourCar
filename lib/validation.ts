import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional()).transform((v) => v ?? null);
const optionalInt = (min: number, max: number) =>
  z
    .preprocess(blankToNull, z.coerce.number().int().min(min).max(max).nullable().optional())
    .transform((v) => v ?? null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

export const vehicleSchema = z.object({
  year: optionalInt(1885, 2100),
  make: z.string().trim().min(1, "Make is required.").max(60),
  model: z.string().trim().min(1, "Model is required.").max(60),
  trim: optionalText(60),
  vin: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
      z.union([z.literal(""), z.string().regex(/^[A-HJ-NPR-Z0-9]{1,17}$/, "VIN may only contain letters (not I, O, Q) and digits, up to 17 characters.")]),
    )
    .transform((v) => v || null),
  engine: optionalText(100),
  current_mileage: z.preprocess(blankToNull, z.coerce.number().int().min(0).max(10_000_000).nullable()).transform((v) => v ?? 0),
  purchase_date: z.preprocess(blankToNull, isoDate.nullable()),
  notes: optionalText(10000),
});
export type VehicleInput = z.input<typeof vehicleSchema>;

export const jobTypes = ["maintenance", "upgrade", "repair"] as const;
export type JobType = (typeof jobTypes)[number];

export const partSchema = z.object({
  name: z.string().trim().min(1, "Every part needs a name.").max(200),
  part_number: optionalText(100),
  quantity: z.coerce.number().positive("Quantity must be more than 0.").max(100000),
  unit_cost_cents: z.number().int().min(0),
});

export const videoSchema = z.object({
  youtube_video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  start_seconds: z.number().int().min(0).nullable(),
  original_url: z.string().max(500),
  title: optionalText(200),
});

export const jobSchema = z.object({
  id: z.uuid().nullable(),
  vehicle_id: z.uuid(),
  type: z.enum(jobTypes),
  title: z.string().trim().min(1, "Title is required.").max(200),
  performed_on: isoDate,
  mileage: optionalInt(0, 10_000_000),
  description: optionalText(20000),
  labor_minutes: optionalInt(0, 1_000_000),
  total_cost_is_manual: z.boolean(),
  total_cost_cents: z.number().int().min(0),
  reminder_id: z.uuid().nullable(),
  parts: z.array(partSchema).max(200),
  videos: z.array(videoSchema).max(50),
});
export type JobInput = z.input<typeof jobSchema>;

export const photoSchema = z.object({
  storage_path: z.string().min(1).max(500),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export const reminderSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(120),
    interval_miles: optionalInt(1, 1_000_000),
    interval_months: optionalInt(1, 240),
    last_done_mileage: optionalInt(0, 10_000_000),
    last_done_on: z.preprocess(blankToNull, isoDate.nullable()),
  })
  .refine((r) => r.interval_miles != null || r.interval_months != null, {
    message: "Set a mileage interval, a time interval, or both.",
  });
