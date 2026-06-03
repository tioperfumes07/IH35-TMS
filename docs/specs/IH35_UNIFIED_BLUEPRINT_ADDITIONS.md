# IH35-TMS — Unified Blueprint Additions

> Companion to IH35_MASTER_BLUEPRINT_v3_FULL.md. Captures every chat-derived
> addition, refinement, and clarification from Jorge that is NOT in the formal
> v3 blueprint but IS approved-and-locked design.

> Cursor: read this file in addition to the formal blueprint. If guidance
> conflicts, this file wins.

> Append-only. New additions get a date stamp + chat reference.

Last updated: 2026-05-12 by Jorge + Claude (Block K PR1 additions)

---

## TABLE OF CONTENTS

1. Maintenance — Work Order display ID format with V5 vendor invoice digit suffix
2. Maintenance — Mandatory vendor invoice linkage (external + internal)
3. Maintenance — Light parts inventory (anti-theft daily-purchase pattern)
4. Maintenance / Safety — Integrity & Anomaly Detection (theft + collusion alerts)
5. Dispatch — Authorization gates (WF-044 advisory + WF-050 hard block + WF-038 HOS check) — formal enforcement
6. Maintenance — "Arriving Soon Needs Service" priority queue
7. Driver PWA — In-transit issue / accident reporting flow surfacing
8. Permanent Cursor rule infrastructure
9. Vendor management — PC*MILER cancelled
10. Infrastructure — Anthropic API + Google Cloud + Gmail Push live in Render
11. Compaction policy — Save-to-disk-first
12. Communication preference — tioperfumes07@gmail.com pattern
13. Phase 8A Legal module (Option C approval)
14. Phase 8C — Driver Scheduler / workforce planning (Block K)
15. Data Sovereignty + Samsara capability invariants (2026-05-21 arbitration lock)

---

## 1. Maintenance — Work Order display ID format

Source: Jorge chat 2026-05-06 (multiple messages)
Status: LOCKED
Implementation block: P3-T11.6.1

### Format

WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}

Example: WO-T169-IS-05-06-2026-0035-23914

### Segments

| Segment | Source | Notes |
|---------|--------|-------|
| WO- | Fixed prefix | always |
| {UNIT} | master_data.units.display_id | e.g., T169, T177 |
| {TYPE} | source_type column (enum) | 2-char code, see table |
| {MM-DD-YYYY} | WO creation date | leading zeros, 4-digit year |
| {NNNN} | per-unit cumulative LIFETIME sequence | 4-digit zero-padded; NEVER resets |
| {V5} | last 5 chars of vendor invoice# OR vendor WO# | Jorge addition 2026-05-06 — cross-reference |

### Source type codes (7)

| Code | Meaning |
|------|---------|
| IS | Internal Shop (IH35 own shop, non-tire) |
| ES | External Shop |
| AC | Accident (linked to safety accident report) |
| ET | External Tires (Loves, TA, Pilot, etc.) |
| RT | Roadside Tires (vendor came to truck) |
| IT | Internal Tires (IH35 own shop, tire-specific) |
| RS | Roadside Service (non-tire roadside: tow, jump start, breakdown call) |

### V5 (vendor invoice digit suffix) — JORGE ADDITION 2026-05-06

The last 5 characters of the vendor's reference number, appended for cross-reference safety.

Selection rule:
- For ES/AC/ET/RT/RS WOs: last 5 chars of external_vendor_invoice_number (preferred) OR external_vendor_wo_number (if invoice not yet entered) — use the value entered first, lock when set
- For IS/IT WOs with parts: last 5 chars of the FIRST parts_invoice_links.vendor_invoice_number for the WO (FIFO order by created_at)
- For IS/IT WOs with labor_only_no_parts = true: literal string "LABOR"
- If vendor reference is shorter than 5 chars: zero-pad on left (e.g., invoice "42" → "00042")
- For pending vendor entry: "PEND0"
- For backfilled rows: "LEGCY"

Display ID re-generation triggered when:
- WO created with vendor reference (initial generation)
- Vendor invoice number changed BEFORE completion
- First parts_invoice_links added to IS/IT WO (recompute V5)
- V5 IMMUTABLE after WO transitions to status='completed'

Rationale: "Even though we put that info in the system, having it embedded in the WO display ID lets anyone reading a WO number quickly cross-reference to the vendor's paperwork without opening the record."

### Sequence rule

The {NNNN} is per-unit cumulative across ALL source types, lifetime — never resets.

Example for unit T169:
- WO-T169-IS-03-15-2026-0033-78321 (oil change)
- WO-T169-AC-04-02-2026-0034-LT441 (accident at border)
- WO-T169-IS-05-06-2026-0035-23914 (today's repair)
- WO-T169-ET-05-08-2026-0036-08821 (next external tire)

Unit T177 has its own independent counter starting at 0001.

### Backfill rule

Existing work_orders rows backfilled by:
- source_type defaults to 'IS' (best heuristic)
- unit_sequence assigned by created_at order per unit
- V5 defaults to "LEGCY" for backfilled rows
- Original display_id preserved as legacy_display_id column for audit trail

---

## 2. Maintenance — Mandatory vendor invoice linkage

Source: Jorge chat 2026-05-06
Status: LOCKED
Implementation block: P3-T11.6.1

### External shop WOs (ES, AC, ET, RT, RS)

ALL of these fields REQUIRED before WO can transition to status='completed':
- external_vendor_id (FK to master_data.vendors)
- external_vendor_wo_number (text)
- external_vendor_invoice_number (text)
- external_vendor_invoice_amount (numeric 10,2)
- external_vendor_invoice_doc_id (FK to documents.documents, optional but recommended R2 PDF upload)

Cost reconciliation enforcement:
- WO total_cost MUST equal external_vendor_invoice_amount within $0.01
- Trigger raises E_COST_RECONCILIATION_FAILED if mismatch on completion attempt

### Internal shop WOs (IS, IT)

For each part used: required entry in NEW table maintenance.parts_invoice_links:
- vendor_id (FK)
- vendor_invoice_number (text)
- vendor_invoice_amount (numeric)
- qty_used (int)
- part_description (text)
- parts_inventory_id (optional FK)

Reconciliation enforcement:
- Sum of (vendor_invoice_amount × qty_used) for all parts on WO MUST equal WO cost section parts subtotal
- Exception: labor_only_no_parts = true flag allows completion with no parts links
- Trigger raises E_PARTS_INVOICE_LINK_REQUIRED if violated

### Rationale (Jorge)

"All work orders outside our shop must have an invoice and amount linked to it matching ours from the cost section. All internal type of work orders must be linked to an invoice from a vendor. We do not stock parts."

---

## 3. Maintenance — Light parts inventory

Source: Jorge chat 2026-05-06
Status: LOCKED
Implementation block: P3-T11.6.1

### Why "light" and not full inventory

Jorge: "We keep very little stock and usually purchase every day to reduce risk of theft."

This is an anti-theft pattern. Daily purchases mean low standing inventory at any moment. The system tracks the small in-flight stock between purchase and consumption.

### NEW table: maintenance.parts_inventory

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| part_description | TEXT | e.g., "Brake pad set, front, T680" |
| vendor_id | UUID FK | preferred vendor |
| last_purchase_invoice_number | TEXT | for cross-reference |
| last_purchase_amount | NUMERIC(10,2) | per unit at last purchase |
| last_purchase_date | DATE | |
| on_hand_qty | INT default 0 | most rows sit at 0 most of the time |
| location | TEXT | optional shelf/bin descriptor |
| operating_company_id | UUID | RLS scoping |

### Atomic decrement on WO part usage

When a parts_invoice_links row is created with parts_inventory_id set, the linked parts_inventory.on_hand_qty decrements atomically in the same transaction.

### Variance tracking (theft detection)

PATCH /parts-inventory/:id/adjust accepts delta_qty + reason (enum: used | discarded | shrinkage | recount). Each adjustment writes audit event maintenance.parts_inventory.adjusted. Phase 5 builds full theft-variance reports on top.

### Empty state messaging

"No parts on hand. Click + Record Purchase to track daily purchases. Anti-theft pattern: minimal stock kept on hand."

---

## 4. Maintenance / Safety — Integrity & Anomaly Detection

Source: Jorge chat 2026-05-06 (originally in maintenance.html, formally moved to Safety per Jorge)
Status: LOCKED — data foundation in Phase 3, alert engine in Phase 6
Implementation:
- Phase 3 ships VIEWS (P3-T11.6.1)
- Phase 6 ships alert engine (NEW task P6-T-INTEGRITY)

### Module ownership

Jorge: "This section was originally in maintenance, but we can move it to safety."

Decision: Lives in Safety module UI (Safety sub-nav adds "Integrity Alerts" tab making it 9 routes total). Schema lives in maintenance.* and safety.* shared via views.

### Threat model (what we're detecting)

Jorge: "It is to detect theft by employees, drivers, mechanics, collusion with external mechanic shops."

Specific patterns:
1. Tire theft / premature wear — units changing tires more often than baseline
2. Fuel theft / unauthorized use — drivers with MPG below fleet baseline
3. Mechanic kickback / collusion — same part costs more from one vendor; vendor invoice frequency spikes
4. Driver damage clusters — driver associated with too many WOs/accidents across multiple units
5. Phantom repairs — WOs created but no parts/labor reconciliation
6. Repeat-failure patterns — same repair type recurring on same unit

### Alert categories (Phase 6 detection logic — Phase 3 ships views that feed it)

PER-UNIT:
1. TIRE FREQUENCY — >2 tire WOs in 60 days
2. REPAIR FREQUENCY — >N WOs in 30-day window OR same repair type recurring
3. UNIT COST ANOMALY — lifetime/90-day cost above fleet baseline
4. ACCIDENT FREQUENCY — >N accidents in 12-month window

PER-DRIVER:
5. DRIVER INCIDENT/ACCIDENT — >N safety events OR >N accidents in 90 days (across all units driven)
6. DRIVER REPAIR FREQUENCY — >N WOs across all units driven in 90 days
7. DRIVER FUEL CONSUMPTION (MPG) — significantly below fleet baseline for equipment class
8. DRIVER TIRE CHANGE FREQUENCY — driver's units accumulate tire changes faster than baseline

PER-VENDOR:
9. VENDOR COST ANOMALY — same part costs more from one vendor (price gouging)
10. VENDOR INVOICE FREQUENCY — vendor invoices spike unexpectedly
11. VENDOR-DRIVER COLLUSION — same vendor frequently used by same driver across units (kickback pattern)

### NEW VIEWS (Phase 3 ships these)

- views.maintenance_unit_history — per-unit aggregate
- views.maintenance_driver_history — per-driver aggregate
- views.maintenance_vendor_history — per-vendor aggregate
- views.maintenance_fleet_baselines — per-equipment-class baselines for comparison

All views WITH (security_invoker = true).

### NEW Phase 6 task: P6-T-INTEGRITY

Phase 6 alert engine:
- Polls views on schedule
- Generates alerts in safety.integrity_alerts table
- Alerts surface in Safety > Integrity Alerts tab
- Notifications via WF-043 dispatcher to Owner + Safety
- Owner can acknowledge / dismiss / escalate alerts

This is a NEW task to add to Phase 6 plan.

---

## 5. Dispatch — Authorization gates (formal enforcement)

Source: Already in formal blueprint (WF-044, WF-050, WF-038) — but NOT YET WIRED in T11.5 Dispatch shipment
Status: LOCKED — must ship as P3-T11.5.1 cleanup task
Implementation block: P3-T11.5.1 (NEW)

### What's in the blueprint (already)

- WF-044 (Maintenance-due alert on assignment): Advisory warning, does NOT block
- WF-050 (DVIR major defect HARD BLOCK): master_data.units.is_dispatch_blocked = true set when any DVIR has major defect; cleared automatically when follow-up WO closes
- WF-038 (HOS violation block): Driver assignment rejected with E_DRIVER_HOS_VIOLATION
- is_dispatch_blocked column on master_data.units exists in schema

### What's MISSING in T11.5 Dispatch (gap to fix)

T11.5 shipped Book Load modal without:
- Maintenance-due check on unit assignment (WF-044 query)
- is_dispatch_blocked hard block on unit assignment (WF-050 enforcement)
- HOS violation check on driver assignment (WF-038 enforcement)
- Override path with audit event for Manager to bypass advisory warnings

### Jorge's intent (chat 2026-05-06)

"There were protections and authorizations in dispatch so it could coordinate with maintenance, if service was urgent dispatcher would not be able to book load unless overridden by him, etc. We had all those in place."

### Implementation requirements

In POST /api/v1/dispatch/loads (Book Load) — before insert:

1. Maintenance-due check (WF-044): Query maintenance.work_orders for unit's open PM-due WOs. If found, return wf_044_maintenance_warnings array (advisory).

2. is_dispatch_blocked hard check (WF-050): If master_data.units.is_dispatch_blocked = true, return 422 with E_UNIT_DISPATCH_BLOCKED. NOT overrideable except by Owner with explicit audit event dispatch.unit_block_overridden_by_owner (critical — fires WF-064).

3. HOS check (WF-038): If safety.driver_hos_status.is_in_violation = true for assigned driver, return 422 with E_DRIVER_HOS_VIOLATION. Manager-or-Owner override with audit event dispatch.hos_override_by_manager (warning — fires WF-064).

### UI surfacing

Dispatch home shows:
- Lightning-bolt icon on unit display IDs that have open PM-due WOs (WF-044 advisory)
- Red lock icon on unit display IDs that have is_dispatch_blocked = true
- HOS badge color on driver display IDs (green/yellow/red)
- Tooltip on hover shows reason

Book Load modal blocks/warns at submit with appropriate banner + override button (Manager/Owner only) requiring reason text.

---

## 6. Maintenance — "Arriving Soon Needs Service" priority queue

Source: Jorge chat 2026-05-06
Status: LOCKED — new task P3-T11.6.2
Implementation block: P3-T11.6.2 (NEW)

### Jorge's description

"If a driver reported failures due to service and maintenance the system would let us know and would have a screen showing us that they should be serviced as soon as they arrived."

### Implementation

Add a priority section at the top of /maintenance home above the existing In-Transit Issues triage:

"Arriving Soon — Service Required" card-list view showing units that:
- Have an open in-transit issue (dispatch.intransit_issues.status='open') AND
- Have an estimated arrival to yard within next X hours (Samsara position + last-known-load destination)
- OR have is_dispatch_blocked = true and are mid-load (rolling block — must be serviced before next dispatch)

Each card shows:
- Unit display ID + lightning-bolt if PM-due
- Driver name + photo
- Issue category + severity
- ETA to yard
- Action button: "Prep Bay" (creates draft WO with source_type pre-selected based on issue category)

Notifications via WF-043 dispatcher when truck enters geofence radius (configurable, default 50 miles from yard).

Phase 4 wires the live Samsara ETA integration. Phase 3 ships UI + view; ETA shows "TBD — Samsara integration Phase 4" until live.

---

## 7. Driver PWA — In-transit issue / accident reporting (formal cross-link)

Source: Already in formal blueprint (WF-005 + WF-048) — needs explicit cross-module wiring confirmation
Status: Office side wired in T11.6 + T11.10; PWA side is P4-T6 (Phase 4)

### Office-side wiring (already merged)

- T11.6 Maintenance shipped In-Transit Issues triage band
- T11.10 Safety shipped AccidentReportDrawer with photos + Spawn WO + Spawn Liability

### Driver-side wiring (Phase 4, P4-T6)

- Driver PWA Report Issue button → creates dispatch.intransit_issues row
- Driver PWA Report Accident button → creates safety.accident_reports row
- Both flows: photo capture, GPS location, optional description
- Notifications fire to Dispatcher + Safety + Owner per WF-043
- WF-049 conversion to WO available office-side

### Jorge's intent (re-confirmed chat 2026-05-06)

"If a driver reported an accident on the road we had a screen letting us know there is an issue, we would receive alerts."

This is fully spec'd in v3 blueprint as WF-005/WF-048. Phase 4 P4-T6 implements PWA half. No new spec needed.

---

## 8. Permanent Cursor rule infrastructure

Source: Jorge chat 2026-05-06
Status: LOCKED — meta-process rule

### Problem identified

Jorge: "It has been over 5 times I have to remind you, you were supposed to integrate all these in the plans."

### Solution

docs/specs/CURSOR-PERMANENT-RULES.md (the file Cursor reads at the start of EVERY block).

Every paste box from Claude includes the directive: "Read docs/specs/CURSOR-PERMANENT-RULES.md AND docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md FIRST before writing any code."

This makes spec adherence enforceable and stops the recurrence of the integration-amnesia pattern.

---

## 9. Vendor management — PC*MILER cancelled

Source: Jorge chat 2026-05-06 (Casey Adams email exchange)
Status: LOCKED — cancelled for v1
Implementation: Update tracker; remove from active vendor list

### Decision

PC*MILER quoted $3,150/year entry-level. Casey confirmed no à-la-carte option. Jorge declined per Ch.11 cash flow.

### Substitute strategy

- Settlement miles: Always Track actual miles (already in use)
- Rate-con verification miles: Google Maps Distance Matrix API (~$300-800/year)
- Toll lookups: deferred — not critical
- Reconsider PC*MILER in Q3 2026 at higher truck count (50+) or if rate disputes become problematic

### Tracker impact

- P3-T6 marked CANCELLED
- Deferred-features tracker entry updated

---

## 10. Infrastructure — Anthropic API + Google Cloud + Gmail Push (LIVE)

Source: Jorge setup completed chat 2026-05-06
Status: LIVE in Render

### Anthropic API

- Account: console.anthropic.com (login: tioperfumes07@gmail.com)
- Workspace: IH 35 Trucking LLC
- Billing email: accounting@ih35trucking.net
- Login email: tioperfumes07@gmail.com (subscription visibility)
- Render env var: ANTHROPIC_API_KEY ✅ SET
- $20 starter credit added

### Google Cloud + Gmail API

- Project: ih35-tms-email-ingest ✅ CREATED
- Service account: ih35-tms-email-reader@ih35-tms-email-ingest.iam.gserviceaccount.com
- Domain-wide delegation enabled with scopes: gmail.readonly, gmail.modify, pubsub
- Pub/Sub topic: projects/ih35-tms-email-ingest/topics/ih35-tms-gmail-notifications
- gmail-api-push@system.gserviceaccount.com added as Pub/Sub Publisher

### Render env vars (all SET)

| Key | Value |
|-----|-------|
| ANTHROPIC_API_KEY | sk-ant-api03-... ✅ |
| GOOGLE_SERVICE_ACCOUNT_JSON | full JSON contents pasted ✅ |
| GMAIL_PUBSUB_TOPIC | projects/ih35-tms-email-ingest/topics/ih35-tms-gmail-notifications ✅ |
| GMAIL_WATCHED_MAILBOXES | dispatch@ih35trucking.net,dispatchnb@ih35trucking.net,dispatchsb@ih35trucking.net,accounting@ih35trucking.net,jorge@ih35trucking.net ✅ |
| GOOGLE_CLOUD_PROJECT_ID | ih35-tms-email-ingest ✅ |

### Implementation status

- All credentials live
- Implementation block T9+T10 (combined OCR + Email Push) is READY TO BUILD when Cursor reaches it
- Expected impact: ~12.5 hours/month of dispatcher time saved on rate-con manual entry

---

## 11. Compaction policy — Save-to-disk-first

Source: Jorge chat 2026-05-06 (multiple conversations hit context limit)
Status: LOCKED — meta-process rule

### Problem

When conversation length approaches limit, the next compaction summary may lose detail. Multiple paste boxes have been re-issued because details were forgotten.

### Solution

When Claude detects context approaching limit (or Jorge says "conversation too long"):
1. IMMEDIATELY save all current planning artifacts to /mnt/user-data/outputs/:
   - Updated blueprint additions file
   - Permanent rules file
   - Master tracker
   - Deferred features tracker
   - All pending paste boxes
   - Gap analysis if any
2. Present all files via present_files tool in single response
3. Provide a "next conversation" continuation prompt for Jorge to paste

This way, every conversation handoff is fully recoverable from disk.

---

## 12. Communication preference

Source: Jorge chat 2026-05-06 (explained twice)
Status: LOCKED — design preference

### Pattern

Jorge uses tioperfumes07@gmail.com as the LOGIN email for ALL company software subscriptions (not personal use):
- Gives him visibility on subscription status emails
- Protects against losing access when company domain (ih35trucking.net) has billing lapses (has happened multiple times)
- Critical infrastructure stays accessible regardless of domain status

When applicable, the BILLING email is set separately to accounting@ih35trucking.net so AP receives invoices automatically.

### Applies to

- Anthropic API ✅
- Google Cloud ✅
- (Pattern for future): Render, Neon, Cloudflare, GitHub, etc.

---

## 13. Phase 8A Legal module (Option C approval)

Source: Jorge chat 2026-05-12 ("APPROVE BLOCK H NEW SPEC — FULL OPTION C")  
Status: LOCKED — IMPLEMENTATION AUTHORIZED  
Block: Block H (PR1-PR5)

### Scope lock

Phase 8A ships:
- legal schema (`legal.contract_templates`, `legal.contract_instances`, `legal.signatures`, `legal.contract_audit_log`, `legal.contract_signing_tokens`)
- template library CRUD + versioning + attorney workflow
- tokenized e-sign flow with signer identity verification
- EN/ES/bilingual contract PDF rendering
- immutable legal audit trail (court-evidentiary quality target)
- settlement bilingual rendering mode for B1 drivers
- office legal module UI + signer-facing contract pages

Deferred out-of-scope:
- Lawsuits / legal matters tracker (Phase 8C)
- Annual re-attestation campaigns (Phase 8B)
- Bulk-send campaigns (Phase 8B)
- Audit export packs (Phase 8B)

### Legal template activation gates (LOCKED)

1. All templates seed as `draft` (never auto-active).
2. Contract instances can only be created from `active` templates.
3. `attorney_approved_by` + `attorney_approved_at` remain null until attorney portal approval.
4. Attorney approval remains a hard gate before activation.

### Employee NDA seed source (LOCKED)

Template code: `employee_nda`  
Source artifact: `docs/specs/templates/IH35_Employee_NDA.docx`

Mandatory clauses to preserve in seed + render flow:
- DTSA whistleblower notice
- Protected activity carve-outs (EEOC/NLRB/OSHA/FMCSA)
- Texas §41.001 IP assignment carve-out
- 12-month customer + employee non-solicitation
- Blue-pencil clause (TX BCC §15.51)
- Bilingual provision (English controlling)
- E-sign compliance (TUETA + E-SIGN)
- Three-entity coverage (TRK + TRANSP + USMCA)
- Webb County (Laredo) venue

Variable schema (required):
- `effective_date` (date)
- `employee_full_legal_name` (text)
- `employee_address` (text)
- `company_signer_name` (text)
- `company_signer_title` (text)
- `company_signed_date` (date)
- `employee_signed_date` (date)
- `company_phone` (text)

### Security + audit invariants (LOCKED)

- Signing tokens: single-use + 30-day expiry default.
- Audit records capture IP + user-agent on every legal event.
- `legal.contract_audit_log` is append-only (no UPDATE/DELETE).
- Spanish legal content cannot be finalized by machine translation.

### Coordination constraints (LOCKED)

- Agent-1 owns migration `0125`; legal module starts at `0126+`.
- Work executes in isolated worktree (`IH35-TMS-block-h`) only.
- Render deploy is merge-driven; no manual deploy commands in block execution.

---

## 14. Phase 8C — Driver Scheduler / workforce planning (Block K)

Source: `docs/cursor-blocks/10_CURSOR_BLOCK_K_DRIVER_SCHEDULER.txt` — execution queue 2026-05-12  
Status: LOCKED — PR1 + PR2 IMPLEMENTED (schema/API/office UI + driver PWA + documentation attach)  
Block: Block K (multi-PR; crons, dispatch integration, E2E harness, lists admin — deferred)

### Scope (PR1)

- Catalog: `catalogs.leave_policies`, `catalogs.driver_leave_balances` (per driver, per plan year).
- Safety: `safety.driver_leave_requests`, `safety.driver_leave_days`, `safety.temp_unit_assignments`, `safety.driver_leave_audit_log` (append-only enforcement).
- Leave types include `wfh` (work from home): excluded from balance bucket checks and from balance consumption on approval.
- APIs: driver session routes under `/api/v1/driver/scheduler/*`; office routes under `/api/v1/safety/scheduler/*` (Owner / Administrator / Safety / Dispatcher; policy PATCH Owner+Admin only).
- Safety module UI: Workforce Planning — Driver Scheduler grid, Leave Requests inbox/detail, Leave Balances (architectural design updated to 24 Safety tabs).

### Scope (PR2)

- Driver PWA (`apps/driver-pwa`): routes `/scheduler`, `/scheduler/request` (multi-step submit), `/scheduler/requests` (history + cancel pending); 40-day horizontal calendar; bilingual strings (EN/ES); bottom nav item.
- Driver session API ergonomics: `GET /api/v1/driver/scheduler/my-schedule`, `POST /api/v1/driver/scheduler/request`, and `PATCH .../cancel` derive `operating_company_id` from the authenticated driver (no client-supplied company query).
- `POST /api/v1/driver/scheduler/request/:id/documentation` — body `{ documentation_attachment_id }` links an uploaded `documents.attachments` row to a pending request (audit: `leave_documentation_attached`).

Further PRs in Block K: advance reminder / rollover / escalation crons; dispatch board badges + booking warnings; office grid virtualization; `POST .../documentation` multipart shortcut (if desired); Lists hub leave policy admin; `scripts/e2e-driver-scheduler-test.mjs` (10 scenarios).

### Block K — Canonical office UI routes (LOCKED; 2026-05-12)

Driver Scheduler / workforce planning (**Block K**) **office** UI is nested under the **Safety** module (HOS clocks, workforce health, leave policy), matching `IH35_ARCHITECTURAL_DESIGN.md` Workforce Planning sub-nav and the Block K scope note above (“Safety module UI”).

**Canonical frontend paths (do not use a top-level `/driver-scheduler`):**

- `/safety/driver-scheduler` — Driver Scheduler grid
- `/safety/scheduler/pending-requests` — Leave Requests inbox
- `/safety/scheduler/requests/:id` — Leave request detail
- `/safety/leave-balances` — Leave Balances

**API split (unchanged):** office routes `/api/v1/safety/scheduler/*`; authenticated driver session routes `/api/v1/driver/scheduler/*` (driver PWA).

---

## 15. Data Sovereignty + Samsara capability invariants (2026-05-21 arbitration lock)

Source: 2026-05-20 architecture session + 2026-05-21 arbitration workbook decisions  
Status: LOCKED  
Relevant block: post-CPA architecture/data-sovereignty stream (pre-build contracts)

### Part 14 — Data Sovereignty (locked contract)

IH35-TMS is local-first at runtime. Third-party APIs are integration channels, not request-path data sources.

- **MUST-DS-1** Runtime operational reads SHALL resolve from IH35-managed local stores, not synchronous third-party API calls.
- **MUST-DS-2** External-facing entities SHALL be durably written locally first, then synchronized via queue/worker patterns.
- **MUST-DS-3** Integrations SHALL define delta cadence, full-sync cadence, and event-ingestion paths.
- **MUST-DS-4** Integrations SHALL degrade gracefully during third-party outages: local reads continue, write-back queues, clear user warning, and audit events for outage/recovery.
- **MUST-DS-5** Mirror schemas SHALL preserve external identity and sync metadata sufficient for replay/rebuild/reconciliation.

### Part 15 — Samsara capability invariants (CAP-1..CAP-15)

The following capability set is locked as canonical scope language:

1. Real-time GPS visibility for active loads  
2. Auto-geofence lifecycle per dispatch stops  
3. Arrival prompt threshold correction to 250-foot standard  
4. Auto-status switching from movement/geofence context  
5. Dispatch taxonomy: on_track / behind / delayed (+ risk/complete handling)  
6. HOS-driven fuel stop planning  
7. Predictive maintenance using odometer + engine_hours  
8. DTC severity policy enabling auto-WO path  
9. Event-time vehicle-driver attribution across safety/maintenance/fuel/dispatch  
10. Safety driver scoring surface  
11. Dashcam incident integration  
12. DVIR in safety (already completed capability)  
13. DOT inspection station geofence dwell tracking workflow  
14. Practical/short/actual mileage three-way reporting model  
15. Samsara driver ↔ QBO vendor integrity checks

Cross-capability lock language:

- **MUST-CAP-1** Samsara-derived operational data SHALL be persisted locally before it drives dispatch, fuel, safety, maintenance, or reporting workflows.
- **MUST-CAP-2** Each Samsara entity used in workflows SHALL maintain stable mapping to canonical TMS entities with auditable change history.
- **MUST-CAP-3** CAP-3 correction is normative: **the arrival geofence size is 250 feet, not 25 miles as previously documented**. The prior 25-mile value was a documentation error and must not be reused.
- **MUST-CAP-4** CAP-5 taxonomy names and semantic intent are locked; exact numeric thresholds and recompute cadences are implementation-policy values.
- **MUST-CAP-5** CAP-13 workflow contract is locked (visit detection, outcome workflow, unresolved alerting, fine-link path), while specific thresholds, enum variants, and seeded station sets are implementation-policy values.
- **MUST-CAP-6** CAP-14 remains routing-engine agnostic in canonical text; whichever engine is selected must support practical/short/actual outputs required by reporting and downstream accounting/driver-pay workflows.
- **MUST-CAP-7** CAP-15 integrity is locked at invariant level: one canonical driver identity must reconcile with both Samsara driver identity and QBO driver-vendor identity, with unresolved mismatches surfaced for remediation.

---

## 2026-05-25 — Honest fail-closed env pattern + KNOWN_OFFENDERS_DEBT

Source: Jorge approval in chat 2026-05-25  
Status: LOCKED  
Relevant block: P7-AUDIT-P0-2-HOTFIX-1 / HOTFIX-2

Pattern: env-gated features must NEVER throw at module load when env is missing. Instead, route-registration code consults `apps/backend/src/config/required-env.ts` (`REQUIRED_ENV`), which declares each env's `behavior_in_prod`:

- `hard_fail_at_boot`: backend may throw at boot via `applyEnvStartupChecks`. Only `DATABASE_URL` is currently in this category.
- `disable_feature_log_error`: route registers a fail-closed `503` handler with descriptive error code (e.g. `qbo_webhook_verifier_not_configured`, `twilio_verify_not_configured`).
- `disable_feature_log_warning`: same runtime behavior with warning-level logging.

Static guard contract:

- `scripts/verify-no-boot-throwing-env-checks.mjs` catches module-load throws and top-level env-driven constructors/calls.
- Guard allows only envs explicitly marked `hard_fail_at_boot` in `REQUIRED_ENV`.
- Pre-existing violations are tracked as declared debt in `KNOWN_OFFENDERS_DEBT` with tracker `P7-AUDIT-P0-2-HOTFIX-2`.
- HOTFIX-2 closure requirement: `KNOWN_OFFENDERS_DEBT` must reach zero.

---

## 2026-05-25 — Applied migration immutability guard

Source: Jorge chat 2026-05-25  
Status: LOCKED  
Relevant block: P7-FIX-MIG-IMMUTABILITY-GUARD

Applied migrations are immutable. The `verify:applied-migrations-immutable` guard enforces this. To change behavior, add a new migration with the next available number.

---

## 2026-05-25 — Verify-content conditional/transient rules

Source: Jorge + Cursor triage chat 2026-05-25  
Status: LOCKED  
Relevant block: P7-FIX-VERIFY-CONTENT-DRIFT

`db:verify:critical-runtime -- --verify-content` enforces migration/content parity, with two explicit verifier exemptions:

1. **Conditional DDL skip (`CONDITIONAL_SKIP`)**  
   When a migration wraps `CREATE TRIGGER` / `CREATE FUNCTION` / `CREATE INDEX` in an `IF EXISTS (...) THEN ... END IF` dependency guard, and the dependency is absent in runtime schema, the wrapped object is treated as a deliberate skip if also absent.

2. **Transient object skip (`TRANSIENT_SKIP`)**  
   Objects created and dropped within the same migration file, and `CREATE TEMP TABLE ... ON COMMIT DROP` artifacts, are excluded from persistent drift targets.

Guardrail: if guard/target states are inconsistent (dependency absent but target present, or dependency present while guarded target is still absent), verifier reports drift rather than silently passing.

---

## 2026-05-25 — Maintenance foundation

Source: Jorge + Cursor execution chat 2026-05-25  
Status: LOCKED  
Relevant block: P7-MAINT-FOUNDATION

Canonical maintenance tab list is locked at 10 tabs (additive-only naming):

1. maintenance-home
2. fleet-table
3. rm-status-board
4. service-location
5. arriving-soon
6. in-transit-issues
7. damage-reports
8. severe-repairs
9. parts-inventory
10. settings

Foundational-shell pattern for MISSING/PARTIAL tabs:

- KPI row (read-backed)
- empty state with icon + heading + one-line description + `+ Create` placeholder CTA
- read-only list/table
- no Add/Edit/Void/CSV-write workflows in this block

Permanent recurrence guards:

- `verify:maintenance-routes-bootstrapped` enforces every `apps/backend/src/maintenance/*.routes.ts` module is imported + registered in `apps/backend/src/index.ts`.
- `verify:maintenance-tab-coverage` enforces 10-tab route presence in frontend manifest, component coverage, and required maintenance KPI endpoints.

---

## 2026-05-26 — Branch tooling and pre-push gate

Source: Jorge + Cursor dispatch (IH35-TMS-NEXT-10-BLOCKS Block 01)  
Status: LOCKED  
Relevant block: P7-INFRA-BRANCH-TOOLING

Branch operations are encapsulated as npm scripts with refusal guards (no bypass flags):

- `branch:rebuild-linear` — reset to `origin/main`, apply one or more source SHAs with `git apply --3way`, single commit; conflicts require manual resolve + `--resume`.
- `branch:precheck-push` — feature-branch-only full verify chain + `block-ready`; wired to `.husky/pre-push`.
- `branch:safe-switch` — dirty-tree / in-progress-operation / excessive-checkout guards before `git checkout`.
- `branch:cleanup-stale` — prune locals with no unique work vs `origin/main` (`--dry-run`, confirm, or `--force`).

Canonical reference: `docs/specs/BRANCH-TOOLING.md`.

---

## 2026-05-26 — Branch tooling and pre-push gate

Source: IH35-TMS-NEXT-10-BLOCKS.md Block 01 (P7-INFRA-BRANCH-TOOLING)  
Status: LOCKED  
Relevant block: P7-INFRA-BRANCH-TOOLING

### Scope

- `npm run branch:rebuild-linear` — linearize feature work onto `origin/main` via patch apply + single commit.
- `npm run branch:precheck-push` — build + verify chain + `block-ready` gate before push.
- `npm run branch:safe-switch` — guarded branch switching (dirty tree, in-progress git ops, reflog churn).
- `npm run branch:cleanup-stale` — delete merged local branches with no unique work.
- `.husky/pre-push` runs `branch:precheck-push` automatically (installed by `npm run prepare`).

### Invariants

- Rebuild/switch refuse dirty trees.
- Rebuild refuses `main`.
- Precheck refuses branches behind `origin/main`.
- No auto-push from tooling scripts.
- No env-based bypass for pre-push hook.

Reference: `docs/specs/BRANCH-TOOLING.md`

---

## 2026-05-26 — Sync orchestrator and block:ship

Source: IH35-TMS-BLOCKS-02.5-TO-10.md Block 02.5 (`P7-INFRA-SYNC-ORCHESTRATOR`)  
Status: LOCKED  
Relevant block: P7-INFRA-SYNC-ORCHESTRATOR

New commands:

- `npm run sync`: one status report for branch/head/tree, branch-vs-main, PR/deploy signal, env readiness, and block context.
- `npm run block:ship -- "<message>"`: orchestrates sync -> commit decision -> precheck -> push.

`verify:branch-fresh` now includes a local fallback when CI env is missing:

- If `GITHUB_BASE_SHA` is unset, infer from `origin/main` and print a warning.

This fallback removes local false-negative failures while preserving CI behavior.

---

## Vehicle Profile Part 1 (Block 11, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 11  
Status: LOCKED (Part 1); Part 2 = Block 12 (sections 7–11)  
Relevant block: Phase C — VEHICLE-PROFILE-PART-1

- Migration `0295_vehicle_profile_part1.sql`: `Damaged`/`Transferred` statuses; status-context + border/IRP/insurance columns on `mdata.units`; `mdata.unit_plates`; `mdata.unit_border_crossings`; `is_default` on `telematics.vehicle_driver_assignments`.
- API: `GET /api/v1/mdata/units/:id?operating_company_id=` returns full aggregate; plates CRUD; default-driver endpoints; quick-availability POST.
- Audit: `appendCrudAudit` only (no `audit.events` DB trigger).
- UI: `VehicleProfilePage` six sections + maintenance alerts banner + quick avail toggle; route unchanged `/fleet/units/:id`.
- Measured `block-ready` baseline after Block 10 C5 dedupe: ~487s.

---

## Vehicle Profile Part 2 (Block 12, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 12  
Status: LOCKED (Part 2)  
Relevant block: Phase C — VEHICLE-PROFILE-PART-2

- Migration `0296_vehicle_profile_part2.sql`: reefer columns on `mdata.equipment`; `mdata.unit_photos` (RLS + grants). No unit_documents table.
- API: extended unit aggregate (reefer, financial_ytd, recent_activity, photos, documents, insurance_summary, total_ownership_cost, comparable_metrics); financial endpoint; photos CRUD; documents facade; trip-cost POST; PDF export.
- UI: sections 7–11 + trip cost widget + photo gallery + ownership meter + comparable units widget.
- CI: four new verify guards with explicit `ci.yml` steps (Block 11 lesson).
- Measured `block-ready` baseline from Block 11: ~542s.

---

## Driver Profile Part 1 (Block 13, locked 2026-06-01)

Source: Jorge + Cursor execution order Block 13  
Status: LOCKED (Part 1)  
Relevant block: Phase D — DRIVER-PROFILE-PART-1

- Migration `0297_driver_profile_part1.sql`: endorsements + identity columns on `mdata.drivers` (CDL/medical/drug remain on driver row + `safety.medical_cards` / `safety.drug_test` / `safety.random_pool`).
- API: `GET /api/v1/mdata/drivers/:id?operating_company_id=` returns aggregate (license, medical, drug, HOS via `getCurrentClocks`, current assignment); default-truck POST/clear mirrors unit default-driver on `telematics.vehicle_driver_assignments`.
- UI: `DriverProfilePage` sections 1–6 at `/drivers/:id/profile` with 30s HOS refetch; DQF panel retained below.
- CI: four `verify:driver-profile-*` guards with explicit `ci.yml` steps.

---

## Driver Profile Part 2 (Block 14, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 14  
Status: LOCKED (Part 2)  
Relevant block: Phase D — DRIVER-PROFILE-PART-2

- Migration `0302_driver_profile_part2.sql`: border credential columns on `mdata.drivers` + `mdata.driver_profile_messages`.
- API: aggregate extended with performance, settlements, training, border creds, documents; training CRUD; PDF export; message recording endpoint.
- UI: `DriverProfilePage` sections 7–12 + sticky `ActionBar`.
- CI: four additional `verify:driver-profile-*` part-2 guards.

---

## Trailer Profile Part 1 (Block 15, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 15  
Status: LOCKED (Part 1)  
Relevant block: Phase D — TRAILER-PROFILE-PART-1

- Migration `0303_trailer_profile_part1.sql`: equipment status extension, specs/compliance columns, `mdata.equipment_plates`.
- API: aggregate GET on equipment, plates CRUD, status-change POST, PDF export.
- UI: `TrailerProfilePage` at `/fleet/trailers/:id` with conditional reefer section.
- CI: four `verify:trailer-profile-*` guards.

---

## Compliance Dashboard (Block 16, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 16  
Status: LOCKED  
Relevant block: Phase E — COMPLIANCE-DASHBOARD

- Migration `0304_compliance_dashboard.sql`: notification rules/log tables + carrier credential columns on `org.companies`.
- API: compliance aggregate dashboard, summary, notification rules CRUD, notification log, daily reminder cron.
- UI: `ComplianceDashboardPage` at `/compliance` (Safety flyout link).
- CI: four `verify:compliance-*` guards.

---

## Shipper Portal MVP (Block 18, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 18 (map option B approved)  
Status: LOCKED  
Relevant block: Phase G — SHIPPER-PORTAL-MVP

- Migration `0306_shipper_portal_mvp.sql`: `shipper_portal.portal_users`, `portal_sessions`, `load_milestones`, password reset tokens.
- Separate portal auth (`portal_session` cookie) + `/portal/*` UI (login, dashboard, load detail, profile).
- Load detail: text GPS + milestone timeline (no tile map package in Block 18).
- Internal admin: `PortalUsersTab` on customer profile; API `/api/v1/customers/:id/portal-users`.
- Milestone emails: `portal-dispatched`, `portal-arrived-pickup`, `portal-delivered`, `portal-pod-available` templates.
- CI: five `verify:shipper-portal-*` guards.
- Security reference: `docs/specs/SECURITY-MODEL.md`.

---

## Notification Center (Block 17, locked 2026-06-02)

Source: Jorge + Cursor execution order Block 17  
Status: LOCKED  
Relevant block: Phase E — NOTIFICATION-CENTER

- Migration `0309_notification_center.sql`: `notifications.user_notifications` + `notifications.user_notification_preferences` (per-user RLS).
- API: notification list/unread/read/dismiss/mark-all-read, preferences GET/PATCH, SSE stream optional.
- UI: `NotificationBell` in top nav, `NotificationDropdown`, `NotificationCenterPage` at `/notifications`.
- Wired sources: compliance reminder `in_app` channel, maintenance PM alert creation.
- CI: four `verify:notification-center-*` guards.

---

## END OF UNIFIED ADDITIONS

Append new entries with:
- Date stamp
- Chat reference
- Affected module
- Status (PROPOSED / LOCKED / IMPLEMENTED)
- Relevant block

---

## 2026-05-26 — Branch tooling and pre-push gate

Source: Jorge + Cursor execution chat 2026-05-26  
Status: LOCKED  
Relevant block: P7-INFRA-BRANCH-TOOLING

Branch operations are standardized through project scripts:

- `branch:rebuild-linear` rebuilds feature history from source SHAs onto `origin/main` with conflict-aware `git apply --3way`.
- `branch:precheck-push` is the required push gate: backend build, frontend typecheck build, all `verify:*` scripts, then `block-ready`.
- `branch:safe-switch` enforces clean-tree and low-thrash checkout safety.
- `branch:cleanup-stale` prunes merged local branches while preserving unique work and recent `wip/*`/`tmp/*`.

Pre-push is locked to `npm run branch:precheck-push` via husky. Pushes that bypass the scripted precheck are non-compliant with Phase 7 stabilization process.

---

## 2026-06-02 · Block A5 · Fleet bulk-select checkbox

Source: Block A5 spec (#66-F1)  
Status: LOCKED  
Relevant block: BLOCK-A5-FLEET-BULK-SELECT-CHECKBOX

Fleet Table gains a left-column bulk-select checkbox with sticky BulkActionBar (Change Status / Change Type / Clear). Backend exposes RLS-scoped `POST /api/v1/mdata/units/bulk-update` with one `unit.bulk_update` audit row per affected unit and a 100-unit rate limit.

---

## 2026-06-02 · Block A6 · Edit vehicle modal expanded columns

Source: Block A6 spec (#68-F4)  
Status: LOCKED  
Relevant block: BLOCK-A6-EDIT-VEHICLE-MODAL-EXPAND-67-COLUMNS

Edit Vehicle modal on Fleet Table: eight-tab layout (Identity / Insurance / IRP / Reefer / Financial / Lifecycle / Quick-availability / Documents) surfacing 50+ unit columns. Backend `unit-update-schema.ts` allowlist (58 patchable cols) with Owner RBAC on sale/transfer/repair fields; three CI guards + backend/frontend tests.

---

## 2026-06-02 · Block A9 · Modal doubling pattern fix

Source: Block A9 spec (#67-FAULT-P1-MODAL-DOUBLING)  
Status: LOCKED  
Relevant block: BLOCK-A9-MODAL-DOUBLING-PATTERN-FIX

P1 visual-audit fixes: `WorkOrderDetailModal` uses shared `Modal` title only (no inner `<h2>`); `CustomerEditModal` uses named inputs only (no ghost fields). CI guard `verify-modal-no-doubled-header.mjs` rejects `*Modal.tsx` files that combine shared `Modal` + inner heading tags.

---

## 2026-06-02 — Block 19 Lane profitability heatmap

Source: Block 19 spec (Phase H)  
Status: LOCKED  
Relevant block: BLOCK-19-LANE-PROFITABILITY-HEATMAP

Per-corridor P&L aggregated by pickup/delivery city-state pair with nightly cache refresh and `/reports/lane-profitability` heatmap/table UI. Feeds Block 20 deadhead backhaul suggestions via `reports.lane_profitability_cache`.

---

## 2026-06-02 — Block 20 Deadhead optimization

Source: Block 20 spec (Phase H)  
Status: LOCKED  
Relevant block: BLOCK-20-DEADHEAD-OPTIMIZATION

Per-truck deadhead tracking (% empty miles) with weekly cache refresh and backhaul suggestions sourced from lane-profitability cache (Block 19 dependency). Report at `/reports/deadhead`; widget on vehicle profile when truck is available without active load.

---

## Border Crossing Wizard (Block 21, locked 2026-06-02)

Source: Block 21 spec (Phase F)  
Status: LOCKED  
Relevant block: BLOCK-21-BORDER-CROSSING-WIZARD

- Migration `0313_border_crossing_wizard.sql`: wizard columns on `mdata.unit_border_crossings`; `reference.ports_of_entry` + `reference.cbp_wait_times_cache`.
- API: wizard POST, ports-of-entry, CBP wait times, customs brokers (`vendor_category = customs_broker`), history, eManifest PDF (V1 printable only).
- UI: 6-step wizard at `/dispatch/border-crossing`; history page; `CbpWaitTimesWidget` on Dispatch home + wizard.
- FAST card expiration check from driver profile (Block 14 dependency).
- Note: ACE/eManifest production API (V2) requires CBP enrollment + partner like BorderConnect.
- CI: four `verify:border-crossing-*` guards.

---

## 2026-06-02 — Block 22 Predictive auto-WO from faults

Source: Block 22 spec (Phase I)  
Status: LOCKED  
Relevant block: BLOCK-22-PREDICTIVE-AUTO-WO-FROM-FAULTS

Samsara fault webhook → draft WO automation with configurable severity rules, fault history audit, 24h dedupe, and Block 17 notification wiring. Routes bootstrapped via `form-425c.routes.ts` (no `index.ts` edit). Initial rule set empty — users configure via `/maintenance/fault-rules`.

---

## 2026-06-02 · Block A5 · Fleet bulk-select checkbox

Source: Block A5 spec (#66-F1)  
Status: LOCKED  
Relevant block: BLOCK-A5-FLEET-BULK-SELECT-CHECKBOX

Fleet Table gains a left-column bulk-select checkbox with sticky BulkActionBar (Change Status / Change Type / Clear). Backend exposes RLS-scoped `POST /api/v1/mdata/units/bulk-update` with one `unit.bulk_update` audit row per affected unit and a 100-unit rate limit.

---

## 2026-06-02 · Block B4 · Fleet trailers joined unified list

Source: Block B4 spec (#67-F2)  
Status: LOCKED  
Relevant block: BLOCK-B4-F2-FLEET-TRAILERS-JOINED-UNIFIED-LIST

Fleet Table lists trucks and trailers together via `GET /api/v1/mdata/units?include=trailers` (`kind` discriminator, Type column, kind-based profile navigation). Trailer bulk actions use RLS-scoped `POST /api/v1/mdata/equipment/bulk-update` mirroring A5 truck bulk-update.

## 2026-06-02 · Block B5 · Fleet type filters

Source: Block B5 spec (#64-FAULT-F5)  
Status: LOCKED  
Relevant block: BLOCK-B5-FAULT-F5-FLEET-TYPE-FILTERS

Fleet Table adds a type filter dropdown above the table (All · Truck · Tractor · Reefer · DryVan · Flatbed · Stepdeck · Lowboy · Tanker · Custom). Backend filters via `GET /api/v1/mdata/units?type=<TYPE>` combined AND with `include=trailers` and `status=`. UI syncs `?type=Reefer` in the URL, shows "Showing X of Y vehicles", and Clear filters resets all query params.

---

## 2026-06-02 · Block A8 · Customer detail + billing summary API fix

Source: Block A8 spec (#63-FAULT-F4)  
Status: LOCKED  
Relevant block: BLOCK-A8-FAULT-F4-CUSTOMER-P0-BACKEND-FIXES

`GET /api/v1/mdata/customers/:id/detail` and `GET /api/v1/mdata/customers/:customer_id/billing-summary` are tenant-scoped (TRANSP `app.operating_company_id`), audit-logged on read, and return 404 (not 500) for unknown customers. Billing summary joins `catalogs.payment_terms.days_until_due` (not `days_due`). Canonical aliases remain at `/api/v1/customers/:id/detail` and `/api/v1/customers/:customer_id/billing-summary`. CI guards: `verify:customer-detail-route`, `verify:billing-summary-route`.

## 2026-06-02 · Block B8 · QBO local customer push scheduler

Source: Block B8 spec (#71-FAULT-S1)  
Status: LOCKED  
Relevant block: BLOCK-B8-FAULT-S1-QBO-CUSTOMERS-SYNC-PUSH

Migration `0319` tracks push state on `accounting.qbo_customers` (`sync_status`, `qbo_push_attempts`, `qbo_last_push_at`, `qbo_last_error`). Scheduler `qbo-customers-push.ts` runs every 60s, batch 100, 100/min rate limit, dead-letter at 5 attempts, audit `row_changes.action='qbo_push'`. Status endpoint `GET /api/v1/sync/qbo-customers/status` feeds Office HOME QBO sync card counts.

## 2026-06-02 · Block A10 · URL routing normalize (underscore → hyphen)

Source: Block A10 spec (#68-Block-H)  
Status: LOCKED  
Relevant block: BLOCK-A10-URL-ROUTING-NORMALIZE

Legacy underscore URLs (for example `/lists/driver/pay_rate_templates`) redirected 301 (backend) or client-replaced (frontend) to hyphen canonical routes (for example `/lists/driver/pay-rate-templates`). Catch-all stub routes no longer serve real catalog pages for underscore variants. CI guard `verify:no-underscore-canonical-routes` blocks new underscore canonical route registrations.
