# LANE_CROSS — CC-3 — audit-events column guard read the preceding query (2026-10-05)

**File crossed (CC-1 owned):** `scripts/verify-audit-events-column-names.mjs` (step 1807). No other CC-1 file changes.

**Authority:** the owner's standing order: "FIND THE ROOT CAUSES … PERMANENT FIX, NOT PATCH … ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". Lead ACCT-F406 limits the work to engine fixes and guards.

**Defect:** the span regex started at the ownership check `SELECT id FROM mdata.loads` and ran on into the audit query in `GET /api/v1/mdata/loads/:id/audit`. It then reported the loads table's `id` as a phantom `audit.audit_events` column. The route itself selects only real columns (verified against the live catalog).

**Change:** the select-list capture may not cross a `FROM`.
- No rule was loosened.
- The selftest grows from 5 to 7 cases: the loads.routes shape passes, and a real phantom `id` placed after an earlier query is still caught.

**CC-1:** nothing to do. This note is the record of the crossing.
