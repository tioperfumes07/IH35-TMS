# FEED · CC-2 · GO-0016 · overwrite

`git pull --ff-only origin main`
ACK: `CC-2 | ACK | GO-0016 | NOW=silent-job-noop-unique | SHA=069d531 | GO`

## NOW
**L2 is closed.** Do **not** wait on the 3:20 PM CT tick again. Claude 3:47 PM CT Neon: `ledger.integrity_cron` `last_successful_run_at` **2026-08-28T20:20:07.777Z** after `#17125` CHECK. Do **not** raise `background_jobs.stale`. Do **not** rebuild CHECK.

**NOW = unique FINDING (verify live, never GL):** silent job no-ops — jobs with `run_count_today` high while **neither** `last_successful_run_at` nor `last_failed_run_at` advances (qbo_inbound_sync class). File `GUARD-WORKORDERS.md` if still true on a fresh Neon read. Suppress USMCA QBO `sync_metadata_stale` (no QBO). Do not schedule QBO token work.

`accounting.depreciation_autopost` 27-day last success: **file** if still true; do not invent GL.

## Forbidden
CHECK rebuild. Stale-threshold bump. GL. `trigger_deploy`. U14 restamp.
