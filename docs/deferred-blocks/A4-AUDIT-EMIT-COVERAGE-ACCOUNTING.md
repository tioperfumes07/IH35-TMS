═══════════════════════════════════════════════════════════════
BLOCK A4 — AUDIT-EMIT-COVERAGE-ACCOUNTING
Relates to: Universal Audit Linkage, Layer 1 (WRITE). After A1.
FINANCIAL module → high rigor. Audit emit is READ-ONLY w.r.t. money (it records,
it does not move money), so it is NOT gated — but it must be exhaustive.
═══════════════════════════════════════════════════════════════

GOAL
Every accounting transaction action emits a linked, immutable spine event so every
number on every accounting screen is traceable to who created/edited/voided/posted it.

TO THE CODER — off current main (A1 merged first):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a4-audit-emit-accounting

NO MIGRATION unless an accounting table lacks audit columns (then add per active/inactive rule).

EMIT COVERAGE — call events.log_event() for EACH:
  - invoice.created / invoice.updated / invoice.sent / invoice.voided / invoice.paid
  - bill.created / bill.updated / bill.paid / bill.voided
  - payment.applied / payment.unapplied / payment.refunded
  - journal_entry.posted / journal_entry.reversed
  - expense.recorded / expense.edited / expense.deleted (soft)
  - category.reclassified  (the cust/vend reclass path)
  - period.closed / period.reopened   (immutable-period events)
  Each emits with: actor_user_id, entity_type (invoice|bill|payment|journal_entry|
  expense), entity_id, source_table (the real accounting table), source_reference_id,
  correlation_id, before/after amounts + account refs (numbers rounded, no secrets).

CROSS-LINK TO QBO: where the record syncs to QuickBooks, include the qbo_id (if any)
in the event payload so the audit trail ties the local action to the QBO object.

RULE: emit inside the same DB transaction as the mutation. If the financial write
rolls back, the audit event rolls back too. Never log a phantom posting.

verify-a4-audit-emit-accounting.mjs: assert each mutating accounting handler calls
log_event(. Fail the build if any accounting mutation endpoint emits nothing.
PRE-PUSH Postgres validate if migration added. Push BLOCK_ID=A4-AUDIT-EMIT-ACCOUNTING,
ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
