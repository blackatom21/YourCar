/** save_job RPC: atomic job + parts + videos writes, still bound by RLS. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../helpers/supabase";

let a: TestUser;
let b: TestUser;
let vehicleId: string;

const video = {
  youtube_video_id: "dQw4w9WgXcQ",
  start_seconds: 30,
  original_url: "https://youtu.be/dQw4w9WgXcQ?t=30",
  title: "How to",
};

beforeAll(async () => {
  a = await createTestUser("rpc-a");
  b = await createTestUser("rpc-b");
  const v = await a.client.from("vehicles").insert({ make: "Toyota", model: "Tacoma" }).select().single();
  vehicleId = v.data!.id;
});

afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
});

describe("save_job", () => {
  let jobId: string;

  it("creates a job with ordered parts and videos, and totals the parts", async () => {
    const { data, error } = await a.client.rpc("save_job", {
      job: { vehicle_id: vehicleId, type: "repair", title: "Brakes", mileage: 1000 },
      parts: [
        { name: "Pads", part_number: "D123", quantity: 1, unit_cost_cents: 4500 },
        { name: "Rotors", quantity: 2, unit_cost_cents: 6000 },
      ],
      videos: [video],
    });
    expect(error).toBeNull();
    jobId = data as string;

    const job = await a.client
      .from("jobs")
      .select("total_cost_cents, job_parts(name, sort_order), job_videos(youtube_video_id, start_seconds)")
      .eq("id", jobId)
      .single();
    expect(job.data!.total_cost_cents).toBe(4500 + 12000);
    expect(job.data!.job_parts.sort((x, y) => x.sort_order - y.sort_order).map((p) => p.name)).toEqual([
      "Pads",
      "Rotors",
    ]);
    expect(job.data!.job_videos).toEqual([{ youtube_video_id: "dQw4w9WgXcQ", start_seconds: 30 }]);
  });

  it("replaces parts and videos on update", async () => {
    const { error } = await a.client.rpc("save_job", {
      job: { id: jobId, type: "repair", title: "Brakes (front)", mileage: 1000 },
      parts: [{ name: "Pads", unit_cost_cents: 5000 }],
      videos: [],
    });
    expect(error).toBeNull();
    const job = await a.client
      .from("jobs")
      .select("title, total_cost_cents, job_parts(name), job_videos(id)")
      .eq("id", jobId)
      .single();
    expect(job.data!.title).toBe("Brakes (front)");
    expect(job.data!.total_cost_cents).toBe(5000);
    expect(job.data!.job_parts).toHaveLength(1);
    expect(job.data!.job_videos).toHaveLength(0);
  });

  it("rolls back everything if any part is invalid", async () => {
    const { error } = await a.client.rpc("save_job", {
      job: { id: jobId, type: "repair", title: "Should not stick", mileage: 1000 },
      parts: [{ name: "", unit_cost_cents: 1 }],
      videos: [],
    });
    expect(error).not.toBeNull();
    const job = await a.client.from("jobs").select("title, job_parts(name)").eq("id", jobId).single();
    expect(job.data!.title).toBe("Brakes (front)");
    expect(job.data!.job_parts).toHaveLength(1);
  });

  it("does not let another user update the job", async () => {
    const { error } = await b.client.rpc("save_job", {
      job: { id: jobId, type: "repair", title: "pwned" },
      parts: [],
      videos: [],
    });
    expect(error).not.toBeNull();
    const job = await adminClient().from("jobs").select("title, job_parts(id)").eq("id", jobId).single();
    expect(job.data!.title).toBe("Brakes (front)");
    expect(job.data!.job_parts).toHaveLength(1);
  });

  it("does not let another user create a job on the owner's vehicle", async () => {
    const { error } = await b.client.rpc("save_job", {
      job: { vehicle_id: vehicleId, type: "repair", title: "sneaky" },
    });
    expect(error).not.toBeNull();
  });

  it("is not callable anonymously", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, ANON_KEY } = await import("../helpers/supabase");
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.rpc("save_job", {
      job: { vehicle_id: vehicleId, type: "repair", title: "anon" },
    });
    expect(error).not.toBeNull();
  });
});
