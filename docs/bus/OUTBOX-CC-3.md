# OUTBOX — CC-3 — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

ACK 2026-09-30 · CC-3 · read NOW-CC-3 · starting T-02

T-03 · catalog_ready / On-time click investigation — cannot reproduce live, measured
2026-09-30:
- Backend (dispatch/truck-line/truck-line.routes.ts): reasonsTableExists uses
  `to_regclass('catalogs.load_exception_reasons') IS NOT NULL`, added 2026-09-11
  (fee7a7fdf). to_regclass is catalog metadata, not RLS-gated. Verified live under the
  EXACT scoping withCompanyScope uses (SET LOCAL ROLE ih35_app, no bypass_rls) --
  returns non-null (true) as both neondb_owner and ih35_app.
- The frontend's `catalogReady` (TruckLineBoard.tsx:898) has exactly one consumer
  (:1288) -- an informational banner ("Reason catalog not yet available"). It does not
  disable or gate the On-time node's onClick, which always opens the exception popover
  regardless.
- The actual reasons list the popover shows comes from a SEPARATE endpoint,
  /api/v1/catalogs/load-exception-reasons (load-exception-reasons.routes.ts), which
  hardcodes `catalog_ready: true` (a fixed literal, not a live probe) and queries
  `WHERE operating_company_id = $1 AND is_active = true`.
- Measured live, full scoping (ih35_app role, current_user_id = a real Owner user,
  operating_company_id = USMCA 5c854333-6ea5-4faa-af31-67cb272fef80): count = 11 active
  reasons, matching the 11 the job packet named. No 403 from resolveOperatingCompanyId
  (Owner's org.user_accessible_company_ids() covers every company).
- Backend deployed SHA 7291c8e (built 2026-09-30T14:42:12Z) and frontend deployed build
  15b2636 (built 2026-09-30T15:36:22Z) are both current -- not a stale-deploy issue.
- CONCLUSION: could not reproduce catalog_ready=false or an empty reasons list for the
  Owner role in USMCA with today's deployed code. Either already fixed by an earlier
  commit today (the report predates one of today's many merges) or was transient. If it
  recurs, the next data point that would actually narrow it: the exact role of the user
  who saw it (GRANTLESS-403's known gap is Administrator/Dispatcher/Manager/Safety
  accounts with zero org.user_company_access rows querying a NON-default company --
  Owner is immune to that path) and a browser network-tab capture of the real response
  body, not just the on-screen symptom.
