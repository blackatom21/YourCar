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

## Suggested next steps

- HEIC decoding fallback; parallel uploads with retry.
- Storage orphan sweeper (scheduled function).
- Archive/sell a vehicle instead of deleting it; CSV export of jobs (useful before a sale).
- Phase 2: manuals + cited Q&A (see `docs/PLAN.md`).
