═══════════════════════════════════════════════════════════════════════════════
IH35-TMS — UNIVERSAL AUDIT LINKAGE ARCHITECTURE
The principle: EVERY transaction, action, and state-change is linked + auditable.
═══════════════════════════════════════════════════════════════════════════════

WHY THIS EXISTS
---------------
Jorge's requirement (verbatim intent): "every transaction in this software must be
linked. We are missing the audits in maintenance, accounting, banking, dispatch, etc."

Today the W1 SPINE (events.event_log + events.log_event()) exists as the backbone,
and the newer wave modules (geofence, forced-driver-ack, signed-safety-docs) write
to it. But:
  1. Not every module writes every meaningful action to the spine.
  2. There is no unified AUDIT VIEW to read the spine back per-entity (per vehicle,
     per load, per driver, per invoice, per bill, per account).
  3. Reports do not yet surface "who did what, when, linked to which source record."

This phase closes that gap. It is the foundation of QuickBooks-level trust:
every displayed number / state must be traceable to the event that produced it.

THE THREE LAYERS
----------------
LAYER 1 — WRITE (emit):   every mutating action in every module calls log_event()
                          with actor, action, entity_type, entity_id, before/after,
                          and a source_reference (the originating record).
LAYER 2 — LINK (relate):  every event carries a source_reference_id + source_table
                          so you can click an event and open the exact record that
                          caused it (a banking txn, a work order, a load, a bill).
LAYER 3 — READ (audit):   a universal Audit Trail view + per-entity audit tabs +
                          a Reports "Audit" section that reads the spine back,
                          filterable by module, actor, entity, date.

NON-NEGOTIABLE RULES (apply to every block in this phase)
--------------------------------------------------------
• Spine is APPEND-ONLY and IMMUTABLE (already enforced in W1). No edits/deletes.
• Every event row MUST have: operating_company_id, actor_user_id, action,
  entity_type, entity_id, occurred_at, and (NEW) source_table + source_reference_id.
• Writes go through events.log_event() — never direct INSERT into event_log.
• RLS on every read view: NULLIF(current_setting('app.operating_company_id',true),'')::uuid
• Migrations in db/migrations/ ONLY, timestamped, validated on real Postgres pre-push.
• Additive only. Do not alter existing event_log columns destructively — add columns
  with safe defaults and backfill.
• Existing page designs are LOCKED — any new audit tab on an existing page needs a
  visual preview approved before code dispatch (new pages/back-end/DB do not).

EXECUTION ORDER (this phase, after Waves finish)
------------------------------------------------
  A1  AUDIT-SPINE-LINK-COLUMNS      (DB: add source_table + source_reference_id, backfill)
  A2  AUDIT-EMIT-COVERAGE-DISPATCH  (Dispatch writes all load/assignment actions)
  A3  AUDIT-EMIT-COVERAGE-MAINT     (Maintenance: driver-reported failures + WO lifecycle)
  A4  AUDIT-EMIT-COVERAGE-ACCTG     (Accounting: every txn create/edit/void/post)
  A5  AUDIT-EMIT-COVERAGE-BANKING   (Banking: txns, driver-tagged expenses, transfers)
  A6  AUDIT-UNIVERSAL-VIEW          (read API + universal Audit Trail page)
  A7  AUDIT-PER-ENTITY-TABS         (an "Audit" tab on vehicle, load, invoice, bill, driver)
  A8  AUDIT-REPORTS-SECTION         (Reports → Audit: filterable, exportable)
  A9  AUDIT-CI-EMIT-GUARD           (CI gate: mutating endpoints must emit an event)

Each block below is self-contained and follows the standard push/PR discipline.
Build ONE at a time; merge + deploy-green-audit before building the next.
═══════════════════════════════════════════════════════════════════════════════
