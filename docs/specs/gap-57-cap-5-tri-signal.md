# GAP-57 — CAP-5 Dispatch Board Tri-Signal

On-track / behind / delayed tri-signal for dispatch board rows based on ETA slip, HOS remaining, and vehicle movement (GAP-55 GPS + CAP-4 auto-status context).

## Thresholds

Locked in `thresholds.config.ts`: 60 min on-track max slip, 60–180 min behind, ≥180 min delayed, HOS=0 → delayed, no movement ≥60 min → delayed.

## API

- `GET /api/dispatch/load-status-signal/:load_uuid?operating_company_id=`
- `GET /api/dispatch/load-status-signal/active-loads?operating_company_id=`

## UI

`TriSignalPill` on dispatch board **Status Signal** column (green/amber/red). Hover shows slip, HOS, driver ack age via `TriSignalHoverDetail`.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main:
  - scripts/verify-cap-5-tri-signal.mjs
