═══════════════════════════════════════════════════════════════
BLOCK A5 — AUDIT-EMIT-COVERAGE-BANKING
Relates to: Universal Audit Linkage, Layer 1 (WRITE). After A1.
Banking is the SOURCE of many driver deductions (fuel/cash advances tagged to a
driver) — so this block is what makes the Settlements pending-deductions panel work.
═══════════════════════════════════════════════════════════════

GOAL
Every banking action emits a linked spine event, AND every driver-tagged banking
expense becomes a discoverable "pending deduction" source for Settlements.

TO THE CODER — off current main (A1 merged first):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a5-audit-emit-banking

MIGRATION — db/migrations/<next-timestamp>_a5_banking_driver_tag.sql (only if missing)
  - ensure banking transactions can carry: driver_id uuid NULL,
    deduction_status text CHECK (deduction_status IN ('none','pending','approved','deferred','applied')) DEFAULT 'none',
    settlement_id uuid NULL  (set when applied to a settlement)
  - index on (driver_id, deduction_status) for fast Settlements lookup
  - RLS, NULLIF pattern, is_active + audit, updated_at trigger, "declare", no gen-col chains.

EMIT COVERAGE — call events.log_event() for EACH:
  - banking.txn_created / banking.txn_categorized / banking.txn_edited / banking.txn_deleted(soft)
  - banking.txn_tagged_driver   (driver added to an expense → becomes pending deduction)
  - banking.transfer_created / banking.transfer_reconciled
  - banking.reconcile_started / banking.reconcile_completed
  Each emits with: actor_user_id, entity_type='banking_txn', entity_id,
  source_table='banking.transactions', source_reference_id, correlation_id,
  before/after (rounded amounts, account ref), and when driver-tagged also a
  cross-link entity_type='driver' entity_id=driver uuid.

SETTLEMENTS HOOK (data only, no settlement UI here):
  - when banking.txn_tagged_driver fires, set deduction_status='pending'.
  - expose a read endpoint GET /settlements/pending-deductions?driver_id=...
    that returns all banking txns (+ violations/accidents/company-paid-fines when
    those sources exist) with deduction_status='pending'. This is the feed the
    Settlements review drawer consumes. (The Settlements page itself is a separate,
    gated financial block later — this only provides the source feed + audit.)

verify-a5-audit-emit-banking.mjs: assert each mutating banking handler calls log_event(;
assert deduction_status enum + driver_id column exist.
PRE-PUSH Postgres validate (EXIT:0). Push BLOCK_ID=A5-AUDIT-EMIT-BANKING,
ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
