# LANE_CROSS — CC-3 — five live RLS policies cast current_setting()::uuid bare (2026-10-05)

**Files crossed (CC-1 owned):**
- `db/migrations/202615420900_rls_uuid_cast_defensive_resweep.sql` (claimed #25493)
- `scripts/verify-rls-uuid-cast-nullif.mjs` (step 52)

**Authority:** the owner's standing order: "FIND THE ROOT CAUSES … PERMANENT FIX, NOT PATCH … ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". Lead ACCT-F406 limits the work to engine fixes and guards. This migration writes no rows.

**Defect (measured on prod):** the company-scope policies on dispatch.customer_notify_preferences, dispatch.notify_log, maintenance.pm_schedule_runs, maintenance.pm_auto_wo_log and maintenance.pm_auto_engine_settings cast `current_setting('app.operating_company_id')::uuid` bare.
- As `ih35_app` with the setting `''`, they raise "invalid input syntax for type uuid" instead of returning zero rows (reproduced on a prod fork).

**Root cause:** the 0359 sweep ran once. 0355 was applied an hour after it, and the guard skipped every file numbered below 0359.

**Change:**
- The migration re-runs the 0359 sweep body: ALTER POLICY only, idempotent.
- The guard reads pg_policies. Once the newest sweep is applied it requires zero bare casts, and with no DATABASE_URL it fails closed.

**CC-1:** nothing to do. This note is the record of the crossing.
