# GAP-54 — WF-051 250-Foot Arrival Prompt Correction

## Problem
WF-051 shipped at 25-mile radius (40,233.6m). Jorge confirmed correct radius is **250 feet (76.2m)** on 2026-05-20.

## Change
- `WF_051_ARRIVAL_RADIUS_METERS = 76.2` locked in `wf-051-radius.ts`
- Backend `arrival-prompt.service.ts` and Driver PWA `arrival-prompt-trigger.ts` use shared constant
- One-shot script `migrate-existing-wf-051-geofences.mjs` updates `integrations.geofences`

## Audit date
`WF_051_RADIUS_CHANGE_AUDIT_DATE = 2026-06-05`

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - apps/backend/src/integrations/samsara/geofences/wf-051-radius.ts
  - scripts/verify-wf-051-arrival-radius-meters.mjs
