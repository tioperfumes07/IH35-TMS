# Phase-2 — Expense GL Posting (the now-on cash-out path)

Status: built 2026-06-18 for the driverless **Record-Expense** path (P-NOW). Posting remains gated by
the owner flag `EXPENSE_GL_POSTING_ENABLED`; flipping it ON is the single activation switch. This doc
records how a categorized cash-out posts double-entry to the GL and how it ties to QBO during the
migration. Reuses the EXISTING posting engine — no new GL math.

---

## 1. What posts, and when

A driverless general expense (`POST /api/v1/expenses` with `category_qbo_id` + `payment_account_uuid`,
no `driver_id`) is a **cash-out**. At create time, when `EXPENSE_GL_POSTING_ENABLED` is ON, the route
posts a balanced journal entry through `postSourceTransaction({source_transaction_type:"expense"})` and
flips the header to `posting_status='posted'`. When the flag is OFF it records the expense unposted
(identical to every other expense today) — no behavior change until the owner flips the flag.

Driver-centric callers (with `driver_id`) keep their existing behavior (load attribution; posting still
flag-gated). The explicit `POST /api/v1/expenses/:id/post` action is unchanged.

## 2. The double entry (cash basis — TRANSP)

```
DR  <category expense account>     amount_cents      (the resolved GL expense account)
    CR  <payment/bank account>     amount_cents      (the cash/bank the expense was paid from)
```
- **Debit** comes from the expense LINE's `expense_account_uuid` (a direct `catalogs.accounts` id),
  which `buildExpenseLines` now prefers over the legacy category→metadata mapping, then the
  `uncategorized_expense` role as a last resort.
- **Credit** comes from `accounting.expenses.payment_account_uuid` (`expense_cash_payment`). With no
  payment account but a vendor it would be the AP control account (accrual exception); the driverless
  Record-Expense path always supplies a payment account, so it credits cash.
- Balanced by construction: one debit line = the header total = the credit.

## 3. Category resolution (mirror → ledger, entity-scoped)

The form's category is a **QBO account** (`mdata.qbo_accounts.qbo_id`). The route resolves it to a
`catalogs.accounts` GL id **scoped to `operating_company_id`**:
```sql
SELECT id FROM catalogs.accounts
 WHERE qbo_account_id = :category_qbo_id
   AND operating_company_id = :oci
   AND deactivated_at IS NULL
```
If unresolved (the QBO account isn't yet bridged into this entity's ledger chart) the create is
**rejected** with `category_not_in_ledger_chart` (409) — an honest CoA-gap, never a silent
miscategorization. Closing residual gaps is the separate, owner-gated **CoA-completeness** step (GL-1).
Entity independence is enforced: a QBO account never resolves into another entity's ledger.

## 4. How it ties to QBO (the reconciliation contract)

QBO stays the system of record during migration; the app must tie to it.
- The QBO Purchase line `AccountRef` is now sourced from the expense LINE's `expense_account_uuid`
  (the category), **not** the payment account. (Previously it used `payment_account_uuid`, which
  categorized every expense to the bank account in QBO and could never tie to QBO's P&L.)
- Same amount, same category account → the app's expense and QBO's Purchase tell one story.
- GUARD verifies (Tier-1, before merge): a real expense yields (a) a balanced JE in
  `/accounting/journal-entries` (DR category = CR payment); (b) `/accounting/trial-balance` moves off
  zero correctly; (c) the payment account balance decreases; (d) `accounting.bills` stays 0; (e) the
  QBO Purchase carries the **category** AccountRef (not the bank), same amount; (f) void/edit reverses
  cleanly; (g) the attachment attaches; (h) resolution is entity-scoped.

## 5. Void / reversal

Unchanged: `POST /api/v1/expenses/:id/void` posts a reversing JE (when posted) or flips status (when
unposted), gated by `VOID_ENFORCEMENT_ENABLED`, Owner/Accountant, reason required.

## 6. Schema (migration `202606181400_expenses_driverless_category_posting.sql`)

- `accounting.expenses.driver_uuid` → nullable (driverless general expense).
- `accounting.expense_lines.expense_account_uuid uuid REFERENCES catalogs.accounts(id)` — the direct GL
  debit account on the line. Additive, idempotent, reversible.

## 7. Follow-ups (tracked, not in this change)

- **GL-1 CoA-completeness:** bridge every active QBO account into each entity's `catalogs.accounts`
  (owner-gated account creation) so `category_not_in_ledger_chart` effectively never fires.
- **Flag flip (B2):** flipping `EXPENSE_GL_POSTING_ENABLED` ON is the activation + GUARD-verify gate —
  owner decision, never self-merge.
- QBO Purchase header `AccountRef` (the cash account paid from) is still omitted by the translator
  (pre-existing); add it when wiring full Purchase sync so QBO records the bank side too.
