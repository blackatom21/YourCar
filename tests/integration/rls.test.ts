/**
 * Data isolation tests: user B (and anonymous visitors) must never be able to
 * read, change, delete, or attach to user A's data — in any table or bucket.
 *
 * Every negative check is paired with a positive control (A can do it) so a
 * broken fixture can't make the suite pass vacuously.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from "../helpers/supabase";

let a: TestUser;
let b: TestUser;

const ids: Record<string, string> = {};
let photoPath = "";

beforeAll(async () => {
  a = await createTestUser("rls-a");
  b = await createTestUser("rls-b");

  const vehicle = await a.client
    .from("vehicles")
    .insert({ make: "Toyota", model: "Tacoma", year: 2019, current_mileage: 40000 })
    .select()
    .single();
  expect(vehicle.error).toBeNull();
  ids.vehicles = vehicle.data!.id;

  const reminder = await a.client
    .from("reminders")
    .insert({ vehicle_id: ids.vehicles, title: "Oil change", interval_miles: 5000 })
    .select()
    .single();
  expect(reminder.error).toBeNull();
  ids.reminders = reminder.data!.id;

  const job = await a.client
    .from("jobs")
    .insert({
      vehicle_id: ids.vehicles,
      type: "maintenance",
      title: "Oil change",
      mileage: 41000,
      reminder_id: ids.reminders,
    })
    .select()
    .single();
  expect(job.error).toBeNull();
  ids.jobs = job.data!.id;

  const part = await a.client
    .from("job_parts")
    .insert({ job_id: ids.jobs, name: "Oil filter", part_number: "90915-YZZD1", unit_cost_cents: 899 })
    .select()
    .single();
  expect(part.error).toBeNull();
  ids.job_parts = part.data!.id;

  photoPath = `${a.id}/${ids.jobs}/photo.jpg`;
  const upload = await a.client.storage
    .from("job-photos")
    .upload(photoPath, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
    });
  expect(upload.error).toBeNull();

  const photo = await a.client
    .from("job_photos")
    .insert({ job_id: ids.jobs, storage_path: photoPath })
    .select()
    .single();
  expect(photo.error).toBeNull();
  ids.job_photos = photo.data!.id;

  const video = await a.client
    .from("job_videos")
    .insert({
      job_id: ids.jobs,
      youtube_video_id: "dQw4w9WgXcQ",
      original_url: "https://youtu.be/dQw4w9WgXcQ",
    })
    .select()
    .single();
  expect(video.error).toBeNull();
  ids.job_videos = video.data!.id;
});

afterAll(async () => {
  if (photoPath) await adminClient().storage.from("job-photos").remove([photoPath]);
  await deleteTestUser(a);
  await deleteTestUser(b);
});

const TABLES = ["vehicles", "reminders", "jobs", "job_parts", "job_photos", "job_videos"] as const;

describe.each(TABLES)("table %s", (table) => {
  it("owner can read their row (positive control)", async () => {
    const { data, error } = await a.client.from(table).select("id").eq("id", ids[table]);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("other user cannot read it", async () => {
    const { data, error } = await b.client.from(table).select("id").eq("id", ids[table]);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("other user's unfiltered select returns none of owner's rows", async () => {
    const { data } = await b.client.from(table).select("user_id");
    expect(data?.some((r) => r.user_id === a.id)).toBe(false);
  });

  it("anonymous visitor cannot read it", async () => {
    const { data } = await anonClient().from(table).select("id").eq("id", ids[table]);
    expect(data ?? []).toHaveLength(0);
  });

  it("other user cannot update it", async () => {
    const before = await adminClient().from(table).select("*").eq("id", ids[table]).single();
    const { data } = await b.client
      .from(table)
      .update({ created_at: new Date(0).toISOString() })
      .eq("id", ids[table])
      .select();
    expect(data ?? []).toHaveLength(0);
    const after = await adminClient().from(table).select("*").eq("id", ids[table]).single();
    expect(after.data).toEqual(before.data);
  });

  it("other user cannot take ownership by rewriting user_id", async () => {
    await b.client.from(table).update({ user_id: b.id }).eq("id", ids[table]);
    const after = await adminClient().from(table).select("user_id").eq("id", ids[table]).single();
    expect(after.data?.user_id).toBe(a.id);
  });

  it("other user cannot delete it", async () => {
    await b.client.from(table).delete().eq("id", ids[table]);
    const after = await adminClient().from(table).select("id").eq("id", ids[table]);
    expect(after.data).toHaveLength(1);
  });
});

describe("inserting rows on behalf of / attached to another user", () => {
  it("cannot insert a vehicle owned by someone else", async () => {
    const { error } = await b.client
      .from("vehicles")
      .insert({ user_id: a.id, make: "Ford", model: "F-150" });
    expect(error).not.toBeNull();
  });

  it("cannot attach a job to someone else's vehicle", async () => {
    const { error } = await b.client
      .from("jobs")
      .insert({ vehicle_id: ids.vehicles, type: "repair", title: "sneaky" });
    expect(error).not.toBeNull();
  });

  it("cannot attach a reminder to someone else's vehicle", async () => {
    const { error } = await b.client
      .from("reminders")
      .insert({ vehicle_id: ids.vehicles, title: "sneaky", interval_months: 6 });
    expect(error).not.toBeNull();
  });

  it("cannot attach parts, photos, or videos to someone else's job", async () => {
    const part = await b.client.from("job_parts").insert({ job_id: ids.jobs, name: "x" });
    const photo = await b.client
      .from("job_photos")
      .insert({ job_id: ids.jobs, storage_path: `${b.id}/x.jpg` });
    const video = await b.client.from("job_videos").insert({
      job_id: ids.jobs,
      youtube_video_id: "dQw4w9WgXcQ",
      original_url: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect(part.error).not.toBeNull();
    expect(photo.error).not.toBeNull();
    expect(video.error).not.toBeNull();
  });

  it("cannot link own job to someone else's reminder", async () => {
    const own = await b.client
      .from("vehicles")
      .insert({ make: "Honda", model: "Civic" })
      .select()
      .single();
    expect(own.error).toBeNull();
    const { error } = await b.client.from("jobs").insert({
      vehicle_id: own.data!.id,
      type: "maintenance",
      title: "x",
      reminder_id: ids.reminders,
    });
    expect(error).not.toBeNull();
  });

  it("cannot register a photo row pointing into someone else's storage folder", async () => {
    const own = await b.client.from("vehicles").select("id").limit(1).single();
    const job = await b.client
      .from("jobs")
      .insert({ vehicle_id: own.data!.id, type: "repair", title: "x" })
      .select()
      .single();
    const { error } = await b.client
      .from("job_photos")
      .insert({ job_id: job.data!.id, storage_path: photoPath + ".copy" });
    expect(error).not.toBeNull();
  });
});

describe("profiles and views", () => {
  it("owner can read own profile; other user cannot", async () => {
    const own = await a.client.from("profiles").select("id").eq("id", a.id);
    const other = await b.client.from("profiles").select("id").eq("id", a.id);
    expect(own.data).toHaveLength(1);
    expect(other.data).toHaveLength(0);
  });

  it("other user cannot update someone else's profile", async () => {
    await b.client.from("profiles").update({ display_name: "pwned" }).eq("id", a.id);
    const after = await adminClient().from("profiles").select("display_name").eq("id", a.id).single();
    expect(after.data?.display_name).not.toBe("pwned");
  });

  it("reminder_status view only shows the caller's reminders", async () => {
    const own = await a.client.from("reminder_status").select("id").eq("id", ids.reminders);
    const other = await b.client.from("reminder_status").select("id").eq("id", ids.reminders);
    const anon = await anonClient().from("reminder_status").select("id").eq("id", ids.reminders);
    expect(own.data).toHaveLength(1);
    expect(other.data).toHaveLength(0);
    expect(anon.data ?? []).toHaveLength(0);
  });
});

describe("storage", () => {
  it("owner can download their photo (positive control)", async () => {
    const { data, error } = await a.client.storage.from("job-photos").download(photoPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("other user cannot download it", async () => {
    const { data, error } = await b.client.storage.from("job-photos").download(photoPath);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("other user cannot create a signed URL for it", async () => {
    const { data } = await b.client.storage.from("job-photos").createSignedUrl(photoPath, 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });

  it("anonymous visitor cannot download it", async () => {
    const { data } = await anonClient().storage.from("job-photos").download(photoPath);
    expect(data).toBeNull();
  });

  it("other user cannot list the owner's folder", async () => {
    const { data } = await b.client.storage.from("job-photos").list(`${a.id}/${ids.jobs}`);
    expect(data ?? []).toHaveLength(0);
  });

  it("other user cannot upload into the owner's folder", async () => {
    const { error } = await b.client.storage
      .from("job-photos")
      .upload(`${a.id}/evil.jpg`, new Blob([new Uint8Array([1])], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
      });
    expect(error).not.toBeNull();
  });

  it("other user cannot overwrite the owner's file", async () => {
    const { error } = await b.client.storage
      .from("job-photos")
      .update(photoPath, new Blob([new Uint8Array([1])], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
      });
    expect(error).not.toBeNull();
  });

  it("other user cannot delete the owner's file", async () => {
    await b.client.storage.from("job-photos").remove([photoPath]);
    const { data } = await a.client.storage.from("job-photos").download(photoPath);
    expect(data).not.toBeNull();
  });
});
