/** Database-maintained derived data: job totals, odometer bumps, reminder status. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/supabase";

let u: TestUser;
let vehicleId: string;

beforeAll(async () => {
  u = await createTestUser("derived");
  const v = await u.client
    .from("vehicles")
    .insert({ make: "Toyota", model: "Tacoma", current_mileage: 50000 })
    .select()
    .single();
  vehicleId = v.data!.id;
});

afterAll(() => deleteTestUser(u));

async function newJob(fields: Record<string, unknown> = {}) {
  const { data, error } = await u.client
    .from("jobs")
    .insert({ vehicle_id: vehicleId, type: "maintenance", title: "Job", ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function jobTotal(id: string) {
  const { data } = await u.client.from("jobs").select("total_cost_cents").eq("id", id).single();
  return data!.total_cost_cents as number;
}

describe("job total cost", () => {
  it("sums parts (quantity × unit cost) automatically", async () => {
    const job = await newJob();
    await u.client.from("job_parts").insert([
      { job_id: job.id, name: "Oil", quantity: 6, unit_cost_cents: 750 },
      { job_id: job.id, name: "Filter", quantity: 1, unit_cost_cents: 899 },
    ]);
    expect(await jobTotal(job.id)).toBe(6 * 750 + 899);

    await u.client.from("job_parts").delete().eq("job_id", job.id).eq("name", "Oil");
    expect(await jobTotal(job.id)).toBe(899);
  });

  it("keeps a manual override when parts change, and recomputes when switched back", async () => {
    const job = await newJob();
    await u.client.from("jobs").update({ total_cost_is_manual: true, total_cost_cents: 20000 }).eq("id", job.id);
    await u.client.from("job_parts").insert({ job_id: job.id, name: "Pads", unit_cost_cents: 5000 });
    expect(await jobTotal(job.id)).toBe(20000);

    await u.client.from("jobs").update({ total_cost_is_manual: false }).eq("id", job.id);
    expect(await jobTotal(job.id)).toBe(5000);
  });
});

describe("vehicle mileage", () => {
  it("is bumped by a job with a higher odometer reading, never lowered", async () => {
    await newJob({ mileage: 52000 });
    let v = await u.client.from("vehicles").select("current_mileage").eq("id", vehicleId).single();
    expect(v.data!.current_mileage).toBe(52000);

    await newJob({ mileage: 10000 });
    v = await u.client.from("vehicles").select("current_mileage").eq("id", vehicleId).single();
    expect(v.data!.current_mileage).toBe(52000);
  });
});

describe("reminders", () => {
  async function status(id: string) {
    const { data, error } = await u.client.from("reminder_status").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  it("is never_done until a job is linked, then resets from that job", async () => {
    const { data: r } = await u.client
      .from("reminders")
      .insert({ vehicle_id: vehicleId, title: "Oil", interval_miles: 5000, interval_months: 6 })
      .select()
      .single();
    expect((await status(r!.id)).status).toBe("never_done");

    const today = new Date().toISOString().slice(0, 10);
    await newJob({ mileage: 52000, performed_on: today, reminder_id: r!.id });
    const s = await status(r!.id);
    expect(s.last_done_mileage).toBe(52000);
    expect(s.next_due_mileage).toBe(57000);
    expect(s.status).toBe("ok");
  });

  it("is due_soon within the mileage window and overdue past it", async () => {
    const { data: r } = await u.client
      .from("reminders")
      .insert({
        vehicle_id: vehicleId,
        title: "Tires",
        interval_miles: 5000,
        last_done_mileage: 47300, // due at 52300; vehicle is at 52000 → 300 left
      })
      .select()
      .single();
    expect((await status(r!.id)).status).toBe("due_soon");

    await u.client.from("reminders").update({ last_done_mileage: 46000 }).eq("id", r!.id);
    const s = await status(r!.id);
    expect(s.status).toBe("overdue");
    expect(s.miles_remaining).toBe(-1000);
  });

  it("is overdue by time alone", async () => {
    const { data: r } = await u.client
      .from("reminders")
      .insert({ vehicle_id: vehicleId, title: "Coolant", interval_months: 12, last_done_on: "2020-01-01" })
      .select()
      .single();
    expect((await status(r!.id)).status).toBe("overdue");
  });

  it("exposes category, part and notes through the status view", async () => {
    const { data: r } = await u.client
      .from("reminders")
      .insert({
        vehicle_id: vehicleId,
        title: "Rear axle fluid",
        interval_miles: 30000,
        category: "Driveline",
        part_spec: "75W-85",
        notes: "Off-road interval",
      })
      .select()
      .single();
    const s = await status(r!.id);
    expect([s.category, s.part_spec, s.notes]).toEqual(["Driveline", "75W-85", "Off-road interval"]);
    expect(s.status).toBe("never_done");
  });

  it("rejects a reminder with no interval at all", async () => {
    const { error } = await u.client
      .from("reminders")
      .insert({ vehicle_id: vehicleId, title: "Nothing" });
    expect(error).not.toBeNull();
  });
});

describe("vehicle specs", () => {
  it("stores an ordered list and defaults to empty", async () => {
    let v = await u.client.from("vehicles").select("specs").eq("id", vehicleId).single();
    expect(v.data!.specs).toEqual([]);

    const specs = [
      { label: "Engine oil", value: "5W-30" },
      { label: "Tires", value: "275/60R20" },
    ];
    await u.client.from("vehicles").update({ specs }).eq("id", vehicleId);
    v = await u.client.from("vehicles").select("specs").eq("id", vehicleId).single();
    expect(v.data!.specs).toEqual(specs);
  });

  it("rejects specs that are not an array", async () => {
    const { error } = await u.client.from("vehicles").update({ specs: { label: "x" } }).eq("id", vehicleId);
    expect(error).not.toBeNull();
  });
});
