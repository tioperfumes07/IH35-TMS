═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-36 — G24 Driver PWA Incident Reporting Full (WF-048)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-Q  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-37 (Lane B) — same wave G-Q

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-37 owned):
  apps/backend/src/dispatch/equipment-transfer/**
  apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/driver-pwa/src/screens/IncidentReport.tsx                              (EDIT — wire to full WF-048)
  apps/driver-pwa/src/components/incident/IncidentTypePicker.tsx              (NEW)
  apps/driver-pwa/src/components/incident/PhotoChain.tsx                      (NEW)
  apps/driver-pwa/src/components/incident/WitnessForm.tsx                     (NEW)
  apps/driver-pwa/src/components/incident/PoliceReportPicker.tsx              (NEW)
  apps/backend/src/safety/incidents/full-report.service.ts                    (EDIT — accept full payload)
  apps/backend/src/safety/incidents/auto-workflow-trigger.ts                  (NEW)
  apps/backend/src/safety/incidents/__tests__/full-report.test.ts             (NEW)
  scripts/verify-driver-pwa-incident-full.mjs                                 (NEW CI guard)
  docs/specs/gap-36-driver-pwa-incident-full.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G24 master rule + WF-048 spec · Incident reporting in driver PWA 
        shipped at T11.15.3 as stub (basic photo + note) — needs FULL 
        compliance flow per 49 CFR §390.15 + state requirements

PROBLEM: Current incident report only captures photo + note. WF-048 requires:
  - Incident type taxonomy (accident / damage / cargo / equipment / injury / 
    breakdown / other)
  - Multi-photo chain-of-custody with EXIF
  - Witness contact info
  - Police report # if applicable
  - Auto-creation of: maintenance WO (if equipment) + safety.accidents row 
    (if accident) + customer notification (if cargo) + insurance carrier 
    BMC filing trigger (if reportable accident)
Today: dispatcher manually creates all these downstream records.

SCOPE — ADDITIVE ONLY (build on existing stub):

PIECE A — IncidentReport screen edit
  IncidentReport.tsx EDIT:
    Step 1: IncidentTypePicker (7 types)
    Step 2: PhotoChain (up to 10 photos, EXIF preserved, geo-tagged)
    Step 3: Description (required, min 50 chars)
    Step 4: Witnesses (0..3 contacts via WitnessForm)
    Step 5: Police report # (if accident type)
    Step 6: Review + Submit

PIECE B — Components
  IncidentTypePicker.tsx: tile grid with icons
  PhotoChain.tsx: multi-photo capture with sequence number + EXIF preserve
  WitnessForm.tsx: name + phone + role (driver / passenger / pedestrian / other)
  PoliceReportPicker.tsx: conditional render when type=accident

PIECE C — Backend service edit
  full-report.service.ts EDIT: accept new payload schema (type, photos[], 
    witnesses[], police_report_number, geo_position).
    Persists to safety.incidents (existing table from T11.15.3, additive 
    columns may be added via separate small migration — but if all columns 
    already exist, no migration needed).

PIECE D — Auto-workflow trigger
  auto-workflow-trigger.ts:
    onIncidentCreated(incident_uuid) →
      If type='equipment' or 'breakdown': auto-create maintenance.work_orders
      If type='accident': auto-create safety.accidents + flag for insurance
      If type='cargo': auto-create safety.cargo_claims draft + notify customer
      If type='injury': auto-create workers_comp_claims draft (uses GAP-9 table)
    All emit audit_event + notify Owner/Safety role.

PIECE E — CI guard
  verify-driver-pwa-incident-full.mjs: all 5 components present in IncidentReport
    flow, auto-workflow trigger wired, 7 incident types catalogued.

PIECE F — Tests
  full-report.test.ts: each incident type's downstream creation, RLS, 
    EXIF preservation, witness handling.

PIECE G — Docs
  docs/specs/gap-36-driver-pwa-incident-full.md (cite WF-048, 49 CFR §390.15)

ACCEPTANCE:
[ ] All 5 screens render in PWA wizard
[ ] EXIF preserved end-to-end
[ ] Auto-workflow creates correct downstream records per type
[ ] Owner + Safety notified on submit
[ ] verify-driver-pwa-incident-full.mjs in CI chain
[ ] No regression on existing T11.15.3 incident stub

CI MUST PASS: build:backend EMIT · driver-pwa tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if EXIF stripped at upload (chain-of-custody broken), STOP — 
       insurance-evidence requirement violated.

POST-MERGE NEXT STEPS: GAP-40 (damage photo EXIF chain) uses same 
       PhotoChain component pattern.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
