# CC-2 — FINAL: all pending work, until SEAT DONE (owner 10-24 8:54 PM CT)

Law: `~/Downloads/10-24-2026-ALL-CODERS-FINAL-RUN-LAW.md` (read once). Rows: `~/Downloads/10-24-2026-CC2-PENDING-ROWS-FINAL.md` — 46 rows. Do every row.

## Order
1. **443.341 suggestion engine v2.** Finish the push and merge it now. RC1–RC5 per the box in Downloads:
   - no catch-all → 9000;
   - correct rule targets: Dreamline/Alberto per their files; related parties per party, 8000 (not 2410);
   - history learning;
   - payee parsing;
   - re-suggest the 113 lines.
   It stays suggest-only.
2. **RC6: relay fill driver from the load.** When a Relay fuel row has a load_id (or a unit + time inside a load's trip window), `matched_driver_id` comes from that load's assigned driver, automatically, at ingest and on backfill.
   - Backfill goes through an ops script with `--dry-run` (the Lead applies it).
   - Guard: no relay fill tied to a load may have a null driver.
3. **443.348 void/bypass button + catalog.** Box `~/Downloads/10-24-2026-CC2-443348-Void-Bypass-Reason-Button-And-Catalog-Everywhere.md`.
   - Reuse the existing small VoidReasonModal / OverrideButton exactly as built; no redesign.
   - Bulk void uses multi-select and one catalog reason. The backend refuses reasons that are not in the catalog.
   - Guard baseline goes to 0.
4. Then every remaining row in your rows file, top to bottom: dispatch, telematics, fuel, driver/fleet, Relay, stops/geofences.

Report to Lead: "CC-2 DONE" + the PR list.
