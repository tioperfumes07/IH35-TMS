# INBOX-CURSOR · 9222 · LEAD

**YOU HAVE FULL INSTRUCTIONS.** Idle = defect.

**THE LIST:** `docs/lockdown/MODULE-CERTIFY-TRUTH-ONE-PAGE-2026-08-24.md`

**★ FAST-MERGE ON (4 min).** Deploy every **10 minutes AND 10 PRs**, one in-flight.

**NOW:** Ship **DISPATCH-F2-REGRESSION** — live `GET /api/v1/dispatch/alerts/late-arrivals` 500 because `listLateArrivalLoads()` reads `l.is_sample_data` on `views.dispatch_load_with_driver_status` (column does not exist). Exclude via `mdata.loads.is_sample_data`. Do **not** leftover-CERTIFY dispatch. Do not restamp U14. `/425c` do not loop.

Then: unique leftover FINDING overflow only.

OUTBOX: `Cursor | ACK | LATE-ARRIVALS-500 | PORT=9222 | NOW=DISPATCH-F2-REGRESSION | GO`
