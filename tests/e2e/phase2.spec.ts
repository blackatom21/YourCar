/**
 * Phase 2 acceptance (with deterministic local AI stand-ins): upload a manual,
 * watch it process, get a cited answer that opens the PDF at the right page,
 * attach that page to a job, get a clear "not found", and confirm a second
 * account can't reach any of it.
 */
import { expect, test, type Page } from "@playwright/test";
import { tacomaManualPdf } from "../helpers/manual-pdf";

async function signUp(page: Page, label: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/vehicles$/);
}

test("phase 2: manual upload, processing, cited answers, not found, isolation", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signUp(page, "manuals");

  await page.getByRole("link", { name: "+ Add vehicle" }).click();
  await page.getByLabel("Year").fill("2019");
  await page.getByLabel("Make *").fill("Toyota");
  await page.getByLabel("Model *").fill("Tacoma");
  await page.getByRole("button", { name: "Add vehicle" }).click();
  await expect(page.getByRole("heading", { name: "2019 Toyota Tacoma" })).toBeVisible();
  const vehicleUrl = page.url();

  // A job to attach a manual page to later.
  await page.getByRole("link", { name: "+ Log a job" }).click();
  await page.getByLabel("Title *").fill("Rear diff fluid change");
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByRole("heading", { name: "Rear diff fluid change" })).toBeVisible();
  const jobUrl = page.url();

  // Upload.
  await page.goto(`${vehicleUrl}/manuals`);
  await page.locator('input[type=file]').setInputFiles({
    name: "2019_Tacoma_FSM.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await tacomaManualPdf()),
  });
  await expect(page.getByLabel("Title")).toHaveValue("2019 Tacoma FSM");
  await page.getByRole("button", { name: "Upload" }).click();

  // Processing → Ready (the list polls).
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/6 pages · 1 scanned/)).toBeVisible();

  // Ask a question the manual answers.
  await page.getByRole("link", { name: "Ask your manuals" }).click();
  await page.getByLabel("Your question").fill("What is the rear differential filler plug torque?");
  await page.getByRole("button", { name: "Ask" }).click();
  const citation = page.getByRole("link", { name: /\[1\] 2019 Tacoma FSM · page \d+/ });
  await expect(citation).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Cost of this question/).first()).toBeVisible();

  // Attach the cited page to the job.
  await page.getByLabel(/Attach page \d+ to a job/).first().selectOption({ label: "Rear diff fluid change" });
  await page.getByRole("button", { name: "Attach" }).first().click();
  await expect(page.getByText("Attached ✓")).toBeVisible();

  // Citation opens the in-app viewer at that page.
  const href = (await citation.getAttribute("href"))!;
  const citedPage = new URL(href, "http://x").searchParams.get("page");
  await citation.click();
  await expect(page.getByTestId("pdf-page")).toHaveAttribute("data-page", citedPage!);
  await expect(page.getByLabel("Page number")).toHaveValue(citedPage!);
  // The page must actually render: no error, and the canvas has dark (text) pixels.
  await expect(page.getByText(/Couldn't open the PDF|is not a function/)).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.getByTestId("pdf-page").evaluate((c: HTMLCanvasElement) => {
          if (!c.width || !c.height) return 0;
          const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] < 128) dark++;
          return dark;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(100);
  const viewerUrl = page.url();

  // Something the manual doesn't cover.
  await page.goto(`${vehicleUrl}/ask`);
  await page.getByLabel("Your question").fill("What is the recommended tire pressure?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("Not found in your manuals").first()).toBeVisible({ timeout: 30_000 });

  // The job now links to the manual page.
  await page.goto(jobUrl);
  await expect(page.getByRole("link", { name: new RegExp(`2019 Tacoma FSM · p\\. ${citedPage}`) })).toBeVisible();

  // Usage page shows the activity.
  await page.goto("/usage");
  await expect(page.getByText("2019 Tacoma FSM").first()).toBeVisible();

  // Another account sees none of it.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other, "intruder2");
  for (const url of [viewerUrl, `${vehicleUrl}/manuals`, `${vehicleUrl}/ask`]) {
    const res = await other.goto(url);
    expect(res?.status(), url).toBe(404);
  }
  await ctx.close();
});
