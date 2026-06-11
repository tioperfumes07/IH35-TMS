═══════════════════════════════════════════════════════════════
README — AUDIT LINKAGE PHASE: BUILD ORDER & RULES
═══════════════════════════════════════════════════════════════
Read 00-AUDIT-LINKAGE-ARCHITECTURE.md first.

BUILD ORDER (one block at a time; merge + deploy-green-audit before next):
  A1  AUDIT-SPINE-LINK-COLUMNS       (DB foundation — do first)
  A2  AUDIT-EMIT-COVERAGE-DISPATCH
  A3  AUDIT-EMIT-COVERAGE-MAINTENANCE (+ driver-reported-failure workflow)
  A4  AUDIT-EMIT-COVERAGE-ACCOUNTING
  A5  AUDIT-EMIT-COVERAGE-BANKING     (also feeds Settlements deductions)
  A6  AUDIT-UNIVERSAL-VIEW            (read layer — after data is emitting)
  A7  AUDIT-PER-ENTITY-TABS           (UI on existing pages → preview-gated)
  A8  AUDIT-REPORTS-SECTION
  A9  AUDIT-CI-EMIT-GUARD             (locks coverage so it can't regress)

THEN: SETTLEMENTS-PAGE-SPEC.md (needs A1 + A5 + live QBO capture + preview + write-gate)

STANDING RULES (apply to every block):
  - Migrations in db/migrations/ ONLY, timestamped, validated on real Postgres pre-push.
  - Spine append-only/immutable; writes via events.log_event() only.
  - RLS NULLIF(current_setting('app.operating_company_id',true),'')::uuid on reads.
  - is_active + audit columns on every entity (active/inactive rule).
  - KEEP ALL verify lines in ci.yml/package.json — never drop one in a rebase.
  - Existing-page UI changes need a visual preview approved before code dispatch.
  - Financial WRITE paths gated on Jorge's explicit OK per block.
  - WE ALWAYS FIX, NEVER DEFER — never weaken a guard to go green.
  - After each merge: audit the deploy landed GREEN in the CORRECT Render service
    (backend IH35-TMS / frontend ih35-tms-web / driver PWA).
═══════════════════════════════════════════════════════════════
