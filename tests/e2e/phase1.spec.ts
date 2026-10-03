/**
 * Phase 1 acceptance: add a truck, log a job with photos and a YouTube link,
 * see it on the timeline, and confirm a second account can't see any of it.
 */
import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page, label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/vehicles$/);
  return email;
}

/** A real JPEG (a screenshot of the current page) to upload as a "camera" photo. */
async function fakePhoto(page: Page, name: string) {
  return { name, mimeType: "image/jpeg", buffer: await page.screenshot({ type: "jpeg", quality: 60 }) };
}

test("phase 1: vehicle, job with photos + video, timeline, and isolation", async ({ page, browser }) => {
  await signUp(page, "owner");

  // Add the truck with a cover photo.
  await page.getByRole("link", { name: "+ Add vehicle" }).click();
  await page.getByLabel("Year").fill("2019");
  await page.getByLabel("Make *").fill("Toyota");
  await page.getByLabel("Model *").fill("Tacoma");
  await page.getByLabel("Engine").fill("3.5L V6");
  await page.getByLabel(/Current mileage/).fill("52000");
  const cover = await fakePhoto(page, "cover.jpg");
  await page.locator('input[type=file]:not([capture])').setInputFiles(cover);
  await page.getByRole("button", { name: "Add vehicle" }).click();
  await expect(page.getByRole("heading", { name: "2019 Toyota Tacoma" })).toBeVisible();
  const vehicleUrl = page.url();
  await expect(page.locator("header img").first()).toBeVisible();

  // Add an oil-change reminder.
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByLabel("What").fill("Oil change");
  await page.getByLabel(/Every \(mi\)/).fill("5000");
  await page.getByLabel(/or every \(months\)/).fill("6");
  await page.getByRole("button", { name: "Save reminder" }).click();
  await expect(page.getByText("No record")).toBeVisible();

  // Log the job from the reminder.
  await page.getByRole("link", { name: "Log it done" }).click();
  await expect(page.getByLabel("Title *")).toHaveValue("Oil change");
  await page.getByLabel(/Mileage/).fill("52300");
  await page.getByLabel("Notes / description").fill("0W-20 full synthetic, 6.2 qt.");
  await page.getByRole("button", { name: "+ Add part" }).click();
  await page.getByLabel("Part 1 name").fill("Oil filter");
  await page.getByLabel("Part 1 number").fill("04152-YZZA6");
  await page.getByLabel("Part 1 unit cost").fill("8.99");
  await page.getByRole("button", { name: "+ Add part" }).click();
  await page.getByLabel("Part 2 name").fill("0W-20 oil (qt)");
  await page.getByLabel("Part 2 quantity").fill("6");
  await page.getByLabel("Part 2 unit cost").fill("7.50");
  await expect(page.getByText("$53.99")).toBeVisible();
  await page.getByLabel("Labor time").fill("45m");
  await page.getByRole("button", { name: "+ Add YouTube link" }).click();
  await page.getByLabel("Video 1 link").fill("https://youtu.be/dQw4w9WgXcQ?t=42");
  const photos = [await fakePhoto(page, "a.jpg"), await fakePhoto(page, "b.jpg")];
  await page.locator('input[type=file]:not([capture])').setInputFiles(photos);
  await page.getByRole("button", { name: "Save job" }).click();

  // Job page shows everything.
  await expect(page.getByRole("heading", { name: "Oil change" })).toBeVisible();
  const jobUrl = page.url();
  await expect(page.getByText("$53.99")).toBeVisible();
  await expect(page.getByText("04152-YZZA6")).toBeVisible();
  await expect(page.getByText("45m")).toBeVisible();
  await expect(page.locator("section img")).toHaveCount(2);
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=42/);

  // Timeline + filter + reminder reset + odometer bump.
  await page.goto(vehicleUrl);
  await expect(page.getByRole("link", { name: /Oil change/ }).last()).toBeVisible();
  await expect(page.getByText("52,300 mi").first()).toBeVisible();
  await expect(page.getByText("OK", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "upgrade" }).click();
  await expect(page.getByText("No upgrade jobs yet.")).toBeVisible();
  await page.getByRole("link", { name: "maintenance" }).click();
  await expect(page.locator("ol li")).toHaveCount(1);

  // A second account sees none of it.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signUp(other, "intruder");
  await expect(other.getByText("No vehicles yet")).toBeVisible();
  for (const url of [vehicleUrl, jobUrl, `${vehicleUrl}/edit`, `${jobUrl}/edit`]) {
    const res = await other.goto(url);
    expect(res?.status(), url).toBe(404);
    await expect(other.getByText("Tacoma")).toHaveCount(0);
  }
  await otherContext.close();
});
