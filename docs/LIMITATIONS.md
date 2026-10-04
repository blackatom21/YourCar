# Known limitations and next steps

Updated at the end of each phase.

## Phase 1

- **HEIC photos on desktop/Android Chrome.** Photos are decoded in the browser to compress them.
  iPhone Safari converts HEIC to JPEG automatically, but uploading a `.heic` file from a desktop
  browser fails with a clear message. Fix: add a HEIC decoder (e.g. `heic2any`, ~1 MB) lazily.
- **Distance unit is a label only.** Switching mi ↔ km doesn't convert stored readings, and the
  "due soon" window (500 by default) is in whichever unit the readings are in.
- **One currency per account**, no conversion.
- **Photo uploads are sequential** and not resumable. Fine for a handful of phone photos; a flaky
  connection mid-upload means re-adding that photo. The job itself is always saved first.
- **Orphaned files are possible** if the browser closes between uploading a photo and attaching it
  to the job. A periodic cleanup job (list objects with no matching `job_photos` row) would fix it.
- **No pagination on the timeline.** Fine for hundreds of jobs per vehicle; add cursor paging later.
- **Reminders are in-app only** (by design for v1); no email/push.
- **Vehicle `archived_at`** exists in the schema but there is no archive UI yet (delete only).
- **Sign-up email** in hosted Supabase uses the default sender, which is rate-limited.

## Phase 2

- **Not yet tested on a real manual with the real providers.** The pipeline is tested end to
  end with deterministic fake providers on a generated PDF. Retrieval quality, OCR quality,
  heading detection, and cost per manual need to be measured on your actual manuals — use
  `npm run eval:manuals` with questions you know the answers to.
- **Voyage model names and prices are unverified.** The Voyage docs/API were unreachable from
  the build environment; `voyage-3.5` / `rerank-2.5` and their prices are configurable and
  should be checked before relying on cost figures.
- **Page numbers are PDF page numbers**, not the manual's printed page labels (e.g. "AX-12").
  The viewer opens the right physical page; printed labels aren't shown.
- **Diagram callouts.** Specs printed only inside illustrations on pages that *do* have a text
  layer aren't extracted (only image-only pages are OCR'd). Fix: also OCR pages that are mostly
  image with little text.
- **Variant mix-ups.** Multi-model manuals list specs per engine/year/drivetrain. The model is
  told the vehicle's details and to give each value with its condition, and the quoted manual
  text is always one tap away — but this is the most likely way to get a wrong value. Always
  check the cited page.
- **Numeric check is a heuristic.** It flags numbers in a cited sentence that don't appear in
  the cited page text, and spec-like numbers with no citation. It can't tell whether the
  *right* number was chosen from a page with many numbers.
- **Large PDFs:** each extraction step re-downloads the PDF; a 300 MB manual means several
  300 MB downloads per ingestion. Fine at personal scale; split the PDF into page batches
  in storage if this becomes slow or costly.
- **Exact vector search per vehicle** (no ANN index): fast for thousands of chunks per vehicle,
  which covers several 1,000-page manuals. Revisit with pgvector iterative index scans if a
  vehicle ever has far more.
- **Inline ingestion** (no Inngest configured) runs inside the web server process; it's for
  local development only.
- **Cost figures are estimates** from list prices in `lib/rag/pricing.ts`, not provider bills.
- **No streaming answers**: the answer appears when complete (typically several seconds).

## Suggested next steps

- HEIC decoding fallback; parallel uploads with retry.
- Storage orphan sweeper (scheduled function).
- Archive/sell a vehicle instead of deleting it; CSV export of jobs (useful before a sale).
- Run the live eval on 2–3 real manuals; tune chunk size, rerank threshold, and answer effort.
- OCR pages that are mostly image even when they have some text (diagram callouts).
- Show printed page labels alongside PDF page numbers.
- Stream answers; cache the system prompt (prompt caching) to cut per-question cost.
- Per-user monthly usage caps before opening to the public; billing later.
