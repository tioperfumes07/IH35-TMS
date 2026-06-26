# GAP-36 — Driver PWA Full Incident Reporting (WF-048)

**Block:** GAP-36  
**Lane:** B  
**Workflow ID:** WF-048

## Goal

Replace the lightweight in-transit issue stub with a complete incident reporting flow from Driver PWA, including structured witnesses, police report details, photo chain metadata, and automatic downstream workflow triggers.

## Driver PWA

- Route remains `"/incident/new"` and now renders a 6-step wizard.
- Incident types: `accident`, `damage`, `cargo`, `equipment`, `injury`, `breakdown`, `other`.
- New components:
  - `IncidentTypePicker`
  - `PhotoChain` (multi-photo capture with EXIF-preservation metadata)
  - `WitnessForm`
  - `PoliceReportPicker`
- Submission path:
  1. Prefer `POST /api/v1/safety/incidents/full-report`
  2. Fallback to legacy `POST /api/v1/dispatch/intransit-issues` if full endpoint is unavailable

## Backend API

### New endpoint

- `POST /api/v1/safety/incidents/full-report`
- Guarded by driver session and driver-to-load ownership checks.
- Writes canonical incident rows through `full-report.service.ts`.

### Auto-workflow on incident creation

- `equipment` / `breakdown` -> creates draft-like row in `maintenance.work_orders`
- `accident` -> creates row in `safety.accidents` (when relation exists) with insurance flag behavior
- `cargo` -> creates row in `safety.cargo_claims` (when relation exists)
- `injury` -> creates row in `safety.workers_comp_claims` (when relation exists)
- Emits audit events and dispatches notifications to `Owner` + `Safety` users

## Compatibility and Safety

- Existing in-transit issue route is preserved for backward compatibility.
- Service code uses relation/column existence checks to run safely across schema variants.
- Optional schema extensions (`witnesses`, `police_report_number`, `incident_subtype`, `geo`) are consumed when present.

## Verification Gate

- Command: `npm run verify:driver-pwa-incident-full`
- Verifies required files, route wiring, endpoint usage, workflow trigger references, block manifest, package script, and CI hook.

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/backend/src/safety/incidents/full-report.service.ts
