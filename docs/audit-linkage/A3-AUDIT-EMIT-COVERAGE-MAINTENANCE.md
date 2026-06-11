═══════════════════════════════════════════════════════════════
BLOCK A3 — AUDIT-EMIT-COVERAGE-MAINT  (+ driver-reported failures workflow)
Relates to: Universal Audit Linkage, Layer 1 (WRITE). After A1.
This block has TWO parts: (1) audit emit coverage, (2) the driver-reported-failure
review workflow Jorge described, surfaced in the per-vehicle maintenance report.
═══════════════════════════════════════════════════════════════

GOAL
1. Every maintenance action emits a linked spine event.
2. Driver-reported failures (submitted from the driver app) appear in each vehicle's
   maintenance report with a clear status: was it worked on or not, in our shop or
   external, and per-request decisions: ACCEPT / DEFER JOB / APPROVE / MARK WORKED-ON.
3. Every vehicle / maintenance report shows the linked history of requests + work.

TO THE CODER — off current main (A1 merged first):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a3-audit-emit-maintenance

MIGRATION — db/migrations/<next-timestamp>_a3_maint_driver_reports.sql
  (only if the driver-reported-failure records don't already have these fields)
  - CREATE SCHEMA IF NOT EXISTS maint  (if not already)
  - table maint.driver_reported_failures (or extend existing):
      id uuid pk, operating_company_id uuid, unit_id uuid, driver_id uuid,
      reported_at timestamptz, description text, severity text,
      status text CHECK (status IN ('reported','accepted','deferred','approved','worked_on','rejected')),
      shop_type text CHECK (shop_type IN ('internal','external', NULL)),
      work_order_id uuid NULL,           -- link to the WO if one was opened
      decided_by uuid NULL, decided_at timestamptz NULL, decision_reason text NULL,
      is_active boolean DEFAULT true, created_at, updated_at, updated_at trigger
  - RLS enabled; NULLIF(current_setting('app.operating_company_id',true),'')::uuid
  - "declare" not "decl"; no generated-col chains.

EMIT COVERAGE — call events.log_event() for EACH:
  - maint.failure_reported            (driver submits from app)
  - maint.failure_accepted            (office accepts the report)
  - maint.failure_deferred            (defer job — capture decision_reason)
  - maint.failure_approved            (approve for work)
  - maint.failure_assigned_shop       (internal vs external)
  - maint.failure_marked_worked_on    (work completed)
  - maint.failure_rejected
  - wo.created / wo.updated / wo.status_changed / wo.closed
  - pm.schedule_created / pm.auto_wo_generated   (the hourly :05 cron path)
  Each emits with: actor_user_id, entity_type='unit' (entity_id = unit uuid) AND a
  second cross-link entity_type='driver_failure' (entity_id = failure uuid),
  source_table='maint.driver_reported_failures', source_reference_id=failure uuid,
  correlation_id, before/after status.

UI — per-vehicle maintenance report (EXISTING PAGE → needs visual preview before code):
  Add a "Driver-reported failures" section to each vehicle's maintenance report:
    - list each reported failure with reported_at, driver, description, severity
    - a STATUS chip: reported / accepted / deferred / approved / worked-on / rejected
    - shop chip: internal / external (when assigned)
    - per-row action buttons: Accept · Defer job · Approve · Mark worked-on
      (each writes the status + emits the spine event above)
    - if a WO was opened, link to it (click-through)
    - a "history" expander showing the full linked audit trail for that failure
  NOTE: this is a change to an existing page → Claude renders a visual preview for
  Jorge's approval BEFORE this part is dispatched. The DB + emit + routes (back-end)
  can ship without preview; the UI section waits for preview sign-off.

verify-a3-audit-emit-maintenance.mjs: assert each mutating maint handler calls
log_event(; assert status enum + decision fields exist in migration.
PRE-PUSH Postgres validate (EXIT:0). Push BLOCK_ID=A3-AUDIT-EMIT-MAINTENANCE,
ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
