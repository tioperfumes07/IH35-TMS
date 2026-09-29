# LEAD RULING — ROUND 203 — DEVIN-B B2/B1/B4 LANE CROSS

**Date:** 2026-09-28
**Lead:** Jorge (owner)
**Seat:** Devin-B
**Round:** 203

## Authorization

The Lead explicitly assigned Devin-B to fix three bugs from the 37-finding bug audit (Round 203):

1. **B2** — `apps/backend/src/auth/session-middleware.ts:22-41` + `apps/backend/src/index.ts` — test auth bypass has no production guard. Fix: NODE_ENV gate + boot-time assertion.
2. **B1** — `apps/backend/src/dispatch/detention.service.ts:327-339, 375-425` — detention billing race, double customer charge. Fix: FOR UPDATE + atomic status flip.
3. **B4** — `apps/backend/src/mdata/workflow-routes.ts:461-516` — reject handler skips callerCanTargetResource. Fix: add the identical check approve has.

## Files authorized (outside Devin-B's normal lane)

- `apps/backend/src/auth/session-middleware.ts` (B2 request-time gate)
- `apps/backend/src/index.ts` (B2 boot-time assertion)
- `apps/backend/src/dispatch/detention.service.ts` (B1 race fix)
- `apps/backend/src/mdata/workflow-routes.ts` (B4 reject handler)
- `scripts/verify-no-auth-bypass-in-production.mjs` (B2 guard)
- `scripts/verify-detention-bridge-no-double-charge.mjs` (B1 guard)
- `scripts/verify-workflow-decide-paths-symmetric.mjs` (B4 guard)

## Constraints

- USMCA only. TRANSPORTATION and TRUCKING frozen.
- No migrations (B3 reassigned — migration 202614540000 is CC-1's).
- No verify-steps files (Devin is chrome-only, authorSteps=false).
- Rule 16 evidence block on every commit.
- Never route around a failing gate — name it and ask.
