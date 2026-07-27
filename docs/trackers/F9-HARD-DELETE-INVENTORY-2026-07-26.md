# F9 — HARD-DELETE INVENTORY (money · audit · maintenance)

**Owner ruling F9 (2026-07-26):** *"never delete money/audit/maintenance records; kill any such job."*
Re-confirmed in chat the same day: **"NOTHING CAN BE DELETED."**

**Status: INVENTORY. Nothing fixed here.** Produced by reading every hit, not by grepping and counting —
several `DELETE`s in this codebase are legitimate recompute-and-rewrite of derived rows, and calling
those violations would be as wrong as missing the real ones.

**Scope:** `apps/backend/src/**`, non-test, hard `DELETE`/`TRUNCATE` against
`accounting.* · banking.* · driver_finance.* · audit.* · maintenance.* · payroll.* · factor.*`.
7 sites found. **No `TRUNCATE` anywhere** and **no `DELETE` against `audit.*`** — the append-only audit
law is holding.

---

## TIER 1 — deletes a MONEY record (3)

### F9-01 · `banking/bank-tx-dedup.ts` — deletes a BANK TRANSACTION — **FIXED 2026-07-27** (voided_at)
```sql
DELETE FROM banking.bank_transactions WHERE id = $1::uuid   -- the manual stub, after merge
```
`mergeManualBankTransactionStub` copies a manually-entered row's fields onto the Plaid-backed row and
then **hard-deletes the manual row**. The stub can carry `receipt_evidence_r2_key`,
`reconciled_obligation_type`/`_id` and `notes` — so the delete destroys who entered it, when, and what
evidence was attached. If the merge maps a field wrong there is no way back.
**Fix shape:** `voided_at` + `merged_into_bank_transaction_id` on the stub; exclude voided rows from
feeds/balances. Void-not-delete (§2), and it preserves the merge's own audit trail.

### F9-02 · `qbo-sync/ap-bills-puller.ts` — SCHEDULED JOB was deleting bill lines — **FIXED 2026-07-27** (voided_at)
```sql
DELETE FROM accounting.bill_lines bl USING accounting.bills b ...  -- orphan sweep, every tick
```
This is literally the thing F9 names: **a job that deletes money records.** The in-code comment
(*"Orphan delete only — never wipe all QBO lines each scheduler tick"*) shows the author already
narrowed it once after a broader delete. Scope is orphans of `source_system='qbo'` bills, but the
blast radius is a scheduler tick against `accounting.*`.
**Fix shape:** soft-delete orphans (`voided_at` + reason `qbo_orphan`) and report them, so a bad pull
is diagnosable instead of silently erasing lines.

### F9-03 · `data-infra/data-infra.service.ts` — factoring lines delete-and-replace — **FIXED 2026-07-27** (superseded_at)
```sql
DELETE FROM factor.faro_invoice_lines WHERE daily_import_id = $1   -- then re-INSERT every line
```
Delete-then-reinsert on each Faro daily import. Factoring lines are money. A re-import that arrives
short or malformed silently replaces good rows with worse ones, and the prior version is gone.
**Fix shape:** version the import (supersede prior lines via `superseded_at`/`import_version`) rather
than destroying them — factoring is secured borrowing and its history is legal evidence.

---

## TIER 2 — deletes a derived/linkage row in a protected schema (4)

| # | Site | Table | Read |
|---|---|---|---|
| F9-04 | `accounting/bills.routes.ts:552` | `accounting.bill_unit_allocation` | delete-then-rewrite on allocation recompute; derived from the bill + pct/miles inputs |
| F9-05 | `maint/wo-ap-posting.service.ts:359` | `accounting.bill_unit_allocation` | same pattern on the WO→AP path |
| F9-06 | `maintenance/work-orders.routes.ts:1395` | `maintenance.work_order_lines` | user-initiated line removal; **already carries a financial guard** — refuses if the WO's Bill/Expense is posted (`WoPostedApError`) |
| F9-07 | `maintenance/parts-invoice-links.routes.ts:246` | `maintenance.parts_invoice_links` | user-initiated unlink of a part↔invoice link |

F9-04/05 are recomputable projections, not ledger rows — the honest read is that they are the weakest
case for a violation. F9-06/07 delete **maintenance** records, which F9 names explicitly; F9-06 is the
better-behaved of the two because it already refuses when money is posted downstream.

---

## Recommended order

1. **F9-02** first — it is the only *job*, and F9 says kill the job.
2. **F9-01** — a money record with attached evidence, and the loss is unrecoverable.
3. **F9-03** — factoring history is legal evidence (Ch.11, secured borrowing).
4. F9-06 / F9-07 — soft-delete + reason; F9-06's guard is the model to copy.
5. F9-04 / F9-05 — decide whether allocations are ledger or projection; if projection, document that
   and leave the rewrite, with a guard asserting they are never read as history.

## Lane note

F9-01 through F9-05 are backend money paths — Cursor's lane per the rules of engagement. Recorded here
rather than reached into. F9-06/F9-07 are maintenance surfaces.

**A guard should follow the fix** (`verify-no-hard-delete-on-money-schemas`) so the class cannot return —
but it must be written AFTER the legitimate recompute cases are classified, or it will either flag them
forever or be weakened on day one.
