# FEED · CC-2 · GO-0014 · overwrite

`git pull --ff-only origin main`
ACK: `CC-2 | ACK | GO-0014 | NOW=cron-tick-1520Z | SHA=069d531 | GO`

## NOW
#17125 CHECK applied on Neon **2:35 PM CT**. last_successful_run_at still **9:20 AM CT**; last_failed_run_at **2:20 PM CT** (tick before the merge).

**Acceptance is the 3:20 PM CT tick** (`20:20Z` if the job is hourly :20). Report `last_successful_run_at` vs `last_failed_run_at`. Nobody may call the cron done before that tick.

Do **NOT** raise `background_jobs.stale` threshold.

Same hour after the tick: unique FINDING USMCA only if the tick fails. Suppress USMCA QBO `sync_metadata_stale` (no QBO on USMCA) — do not “fix” it.

INV-10 HOLD. 9000 real-only $36.12 — do not spend a seat.

## Forbidden
Another CHECK migration. Raise stale threshold. GL math. QBO/TRANSP/TRK. `trigger_deploy`. U14 restamp.
