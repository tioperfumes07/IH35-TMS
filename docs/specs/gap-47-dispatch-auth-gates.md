# GAP-47 — Dispatch Authorization Gates

Central gate registry enforcing WF-044 (PM advisory), WF-050 (DVIR major block), WF-038 (active driver block).

`GET /api/dispatch/auth-gates/check?action=book_load&...`

AuthGatePanel embedded in BookLoad + AssignmentEdit; dispatch mutation routes guarded via preHandler hook.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - apps/backend/src/dispatch/auth-gates/gate-registry.service.ts
