import { describe, expect, it } from "vitest";
import { parseSpecs, reminderSchema, vehicleSchema } from "@/lib/validation";

const vehicle = { year: "2022", make: "Ford", model: "F-150", trim: "", vin: "", engine: "", current_mileage: "", purchase_date: "", notes: "" };

describe("vehicleSchema specs", () => {
  it("defaults to an empty list when omitted", () => {
    const r = vehicleSchema.safeParse(vehicle);
    expect(r.success && r.data.specs).toEqual([]);
  });

  it("trims labels and values", () => {
    const r = vehicleSchema.safeParse({ ...vehicle, specs: [{ label: " Engine oil ", value: " 5W-30, 6 qt " }] });
    expect(r.success && r.data.specs).toEqual([{ label: "Engine oil", value: "5W-30, 6 qt" }]);
  });

  it.each([
    [{ label: "", value: "x" }, "label"],
    [{ label: "x", value: "  " }, "value"],
    [{ label: "x".repeat(61), value: "x" }, "label"],
    [{ label: "x", value: "x".repeat(301) }, "value"],
  ])("rejects a bad spec %#", (spec, field) => {
    const r = vehicleSchema.safeParse({ ...vehicle, specs: [spec] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toContain(field);
  });

  it("caps the list at 100", () => {
    const specs = Array.from({ length: 101 }, (_, i) => ({ label: `L${i}`, value: "v" }));
    expect(vehicleSchema.safeParse({ ...vehicle, specs }).success).toBe(false);
  });
});

describe("parseSpecs", () => {
  it("returns valid stored specs", () => {
    expect(parseSpecs([{ label: "Tires", value: "275/60R20" }])).toEqual([{ label: "Tires", value: "275/60R20" }]);
  });
  it.each([null, undefined, {}, "x", [{ label: 1 }]])("falls back to [] for %j", (raw) => {
    expect(parseSpecs(raw)).toEqual([]);
  });
});

describe("reminderSchema details", () => {
  const base = { title: "Oil", interval_miles: "5000", interval_months: "", last_done_mileage: "", last_done_on: "" };

  it("treats blank details as null", () => {
    const r = reminderSchema.safeParse({ ...base, category: " ", part_spec: "", notes: "" });
    expect(r.success && [r.data.category, r.data.part_spec, r.data.notes]).toEqual([null, null, null]);
  });

  it("keeps filled details", () => {
    const r = reminderSchema.safeParse({ ...base, category: "Engine", part_spec: "FL-500-S", notes: "Every 5k" });
    expect(r.success && [r.data.category, r.data.part_spec, r.data.notes]).toEqual(["Engine", "FL-500-S", "Every 5k"]);
  });

  it("enforces lengths", () => {
    expect(reminderSchema.safeParse({ ...base, category: "x".repeat(41) }).success).toBe(false);
    expect(reminderSchema.safeParse({ ...base, part_spec: "x".repeat(301) }).success).toBe(false);
    expect(reminderSchema.safeParse({ ...base, notes: "x".repeat(2001) }).success).toBe(false);
  });
});
