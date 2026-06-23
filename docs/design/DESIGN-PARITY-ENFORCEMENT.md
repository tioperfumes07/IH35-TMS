# DESIGN-PARITY ENFORCEMENT — permanent fix for "live build is older than the design"

**Author:** GUARD  |  **Date:** 2026-06-23  |  **Status:** LOCKED RULE

## The problem (root cause)
The live app kept rendering an OLDER layout than the design files Jorge uploaded to the project folder
(e.g. the load wizard was missing the Driver HOS block + vertical stop-card address layout; the WO wizard
was missing ~25 of its 44 design fields). Root cause: the build was measured against the PREVIOUS build
and the coder's memory — never re-diffed against the uploaded design file. "Done" was declared on
"I built it" / CI-green, so the design's newer fields silently never landed. This is a process gap, not a
one-off bug — so the fix must be an enforced gate, not another manual ask.

## The rule (LOCKED)
1. **Design law = the project-folder files** (`/mnt/project/*.html`, mirrored in repo at `docs/design/`).
   Every screen below is built to its design file FIELD-FOR-FIELD, SECTION-FOR-SECTION, LAYOUT-FOR-LAYOUT.
2. **Build rule (coder):** before building/editing ANY screen, OPEN its design file and build to it. Never
   from memory or the prior build. A missing DB column is the ONLY legitimate reason to defer a field —
   and that triggers a gated migration first, not a silent omission.
3. **Done rule:** a screen is done ONLY when every required field/column/section from its design file is
   present in the LIVE deployed app. Verified by the CI guard below + GUARD live diff. CI-green alone is
   NOT done.
4. **CI GUARD (new, must be added):** `verify:design-parity` reads `docs/design/design-parity-contract.json`
   and, for each screen, asserts every required token appears in that screen's compiled component source
   (label/header/column text). Missing tokens = RED build. This makes drift impossible to merge silently.

## The contract (machine-checkable — ship `design-parity-contract.json` into the repo)
159 required fields across 12 screens. The coder wires the CI guard to this JSON. Below is the human-
readable punch-list; the JSON is the enforcement source.

### Load Book/Edit Wizard
`design: load-wizard-render-v6.html` → `live: app/dispatch/loads + Book Load` — **35 required fields**
Required: Customer · Customer WO # · Pickup # · Type · Commodity · Weight (lbs) · Cash advance · Fuel advance · Factoring company · Trailer type · Truck unit · Trailer unit · Driver · Team driver · Assignment · Reefer temp ( F) · Reefer mode · Pre-cool · Tarp required? · Tarp qty · Tarp size · Driver pay rate / mi · Reefer setpoint · Driver HOS (hours of service) · Address · City · St · Zip Code · Date · Time · Site contact · Site phone · Dock · Free time / lumper · Lumper amount

### Create/Edit Work Order Wizard
`design: maintenance-create-wo-render-v5.html` → `live: app/maintenance/active-wos + Create Work Order` — **44 required fields**
Required: Unit · Load # auto — unit on active trip · Driver locked — assigned to this trip · Source type · Priority · Status · Odometer Samsara · Engine hrs Samsara · Authorized by employees · Repaired by · Open date · Open time · Close date on completion · Close time on completion · Vendor QuickBooks list · Vendor invoice # · Authorization # · Shop / location vendor address · Service location (mobile / roadside) · System / component · Out of service? · Payment account · Payment method · Terms · Due date from terms · Company / Vendor name · Display name as · Email · Phone · Street address · City · State · Zip · Account no. · Tax ID (1099) · Track 1099? · Default expense account · Serial / DOT # · Condition · Type · Part # / Task (catalog) · Qty/Hr · Unit/Rate · Total

### Maintenance Shell
`design: maintenance-FULL-with-chrome.html` → `live: app/maintenance/active-wos` — **10 required fields**
Required: Unit · Type · Driver · Status · Odometer · Eng hrs · Next PM · Open WOs · Last service · Location

### R&M Status Board
`design: rm-status-board.html` → `live: app/maintenance/rm-status-board` — **0 required fields**
(layout/board screen — diff structure & columns against the design file directly)

### Fleet Table
`design: fleet-table.html` → `live: app/maintenance/fleet-table` — **12 required fields**
Required: UNIT ▾ · VIN · TYPE · MAKE / MODEL · YEAR · ODOMETER · STATUS · NEXT PM · OPEN WO · LOCATION · DOT O/O · EDIT

### Arriving Soon
`design: arriving-soon.html` → `live: app/maintenance/arriving-soon` — **9 required fields**
Required: Include already-arrived · Include non-yard destinations · UNIT · DRIVER · ETA ▾ · DESTINATION · OPEN ISSUE · SEVERITY · PREP

### In-Transit Issues
`design: in-transit-issues.html` → `live: app/maintenance/in-transit-issues` — **8 required fields**
Required: UNIT · DRIVER · LOAD # · FAULT · SEVERITY · LOCATION · ETA · ACTION

### Damage Reports
`design: damage-reports.html` → `live: app/maintenance/damage-reports` — **8 required fields**
Required: REPORT # · UNIT · DATE ▾ · TYPE · DESCRIPTION · LINKED WO · STATUS · PHOTOS

### Road Service
`design: road-service.html` → `live: app/maintenance/road-service` — **9 required fields**
Required: WO # · UNIT · DRIVER · LOCATION · PROVIDER · CALLOUT · ETA / RESPONSE · STATUS · COST

### Service / Location
`design: service-location.html` → `live: app/maintenance/service-location` — **3 required fields**
Required: SERVICE LOCATION ▾ · BUCKET · OPEN WORK ORDERS

### Severe Repairs
`design: severe-repairs.html` → `live: app/maintenance/severe-repairs` — **9 required fields**
Required: WO # · UNIT · DRIVER · ISSUE · LOCATION · DOWN SINCE · EST. RETURN · COST · ACTION

### Accounts Payable
`design: accounts-payable-render.html` → `live: app/accounting/accounts-payable` — **12 required fields**
Required: As of · Aging · Vendor type · Basis · Current · 1–30 · 31–60 · 61–90 · 91+ · Total · Vendor ▲▼ · Type ▲▼

## Sequencing note (real dependencies)
- **Load wizard** HOS block (Section B) + vertical stop-card address layout (Section C): buildable NOW,
  no migration. HIGH PRIORITY — Jorge is actively blocked on these.
- **WO wizard** header fields (Priority/Status/Odometer/Engine-hrs/Authorized-by/Repaired-by/Open-Close/
  Service-location/Authorization#) + VMRS (System-component/Out-of-service/Complaint/Cause/Correction):
  need migration **#1353** — which is currently RED on `build-typecheck`. Fix that CI failure, then #1353
  needs the `JORGE-APPROVED` label to merge. Until then these fields cannot render.
- **WO wizard** parts location/serial: migration #1351 MERGED — buildable now.
- **WO wizard** invoice reconcile (Invoice-Parts/Labor tie + Shop supplies): reconcile gate #1347 — GUARD
  verifies on the FE bundle that carries it.

## What GUARD does going forward (the standing verification)
On every screen the coder reports "done," GUARD opens the design file, opens the LIVE screen, and diffs
field-by-field — reporting MATCH or the exact missing list. No more accepting "I built it." This is the
gate that was missing. The CI guard makes it automatic; GUARD's live diff is the backstop.