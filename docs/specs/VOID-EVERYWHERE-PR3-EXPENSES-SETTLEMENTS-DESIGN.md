# VOID-EVERYWHERE PR-3 / PR-4 — Expenses + Settlements (design, gated)

**Status:** Design / Docs only (no code, no DDL, no posting). **FINANCE — needs Jorge's decision before build.**
**Date:** 2026-06-14
**Part of:** the VOID-EVERYWHERE build (`docs/specs/VOID-EVERYWHERE-DESIGN.md`). Continues the gated sequence.
**Prereqs shipped:** PR-1 (#973, invoices + JEs), PR-2 (#977, bills).

---

## 0. Why this is a design doc and not the next PR

PR-1 and PR-2 worked because invoices, JEs and bills all post to the GL through the **central posting
engine** (`posting-engine.service.ts`), which tags every line on `accounting.journal_entry_postings`
with a `source_transaction_type`. The shared void engine (`void.service.ts`) reverses a void by reading
those lines (`source_transaction_type = 'invoice' | 'bill' | …`) and posting the equal-and-opposite JE.

The remaining VOID-EVERYWHERE targets do **not** share that one clean path, so they are **not** mechanical
mirrors of PR-2:

| Entity | Posts to GL? | How | Mechanical mirror of PR-2? |
|---|---|---|---|
| Invoice | yes | posting engine, `source='invoice'` | ✅ done (PR-1) |
| Journal Entry | yes (is the GL) | direct | ✅ done (PR-1) |
| Bill | yes | posting engine, `source='bill'` | ✅ done (PR-2) |
| **Cash advance / Driver advance** | **yes** | posting engine, `source='cash_advance' \| 'driver_advance'` | **✅ likely mechanical** |
| **Settlement** (`driver_settlements` / `settlement_lines`) | partial | driver-finance path (advance disburse, `settlement-dispute` postings) — **aggregates** advances/lines | ⚠️ needs scope decision |
| **Expense** (`accounting.expenses`) | **not found** | no posting-engine source type; appears to be a load-attribution record (expense_lines → loads) | ⚠️ needs model confirmation |

---

## 1. Expenses — open question (model confirmation)

`accounting.expenses` (+ `accounting.expense_lines`, RLS'd, load-required) carries `status`,
`transaction_date`, `total_amount`, `expense_number`, and category/load attribution — but there is **no
`'expense'` source type in the posting engine** and no journal/posting code in `expenses.routes.ts`.

**Decision (a):** Does an expense post to the GL independently?
- **If NO** (it's a categorization/attribution record that nets through its linked bank transaction or
  bill): then "void expense" = **status flip + `canVoid`/required-reason gating only** — no reversing JE.
  This is a small, safe PR (reuse `canVoid` from the engine; no `postVoidReversal`).
- **If YES** (there is a posting path not yet found): we add an `'expense'` source linkage and mirror PR-2
  exactly.

Recommend confirming against QuickBooks how an IH35 expense is represented (QBO Expense txn vs categorized
bank line), since the void must match QBO's reversal behaviour (per VOID-EVERYWHERE §4).

## 2. Settlements / driver advances — proposed split

- **Cash advances / driver advances** already post through the posting engine
  (`source='cash_advance' | 'driver_advance'`). These are a **mechanical mirror of PR-2**: extend
  `VoidableEntityType` + `readOriginalGlPostings` to those source types, add a flag-aware void on their
  route, reuse the reversing-JE helper. **Lowest-risk next build.**
- **Settlement (the `driver_settlements` header)** aggregates lines/advances. **Decision (b):** does
  voiding a settlement (i) reverse every posted advance/line under it, or (ii) is it blocked once any line
  has posted and only individual advances are voidable? Recommend: a settlement that has posted is
  **void-only at the advance/line level** (block header delete), reversing each posted child via the same
  engine — never a bespoke GL math.

---

## 3. Recommended build order after this doc

1. **PR-3 = cash/driver advances** (mechanical mirror of PR-2 — clean, ship first).
2. **PR-4 = expenses** (small status-flip void if non-posting per decision (a); else mirror).
3. **PR-5 = settlement header** void semantics per decision (b).

All money-path; GUARD verifies any reversing-entry diff vs QuickBooks; never self-merge.

## 4. Decisions needed from Jorge (the gate)
- **(a)** Do expenses post to the GL independently, or net through their bank line / bill?
- **(b)** Settlement-header void = cascade-reverse all posted children, or block-and-void-children-only?
- **(c)** Confirm cash/driver advances should carry the same Owner+Accountant void + reversing-JE mechanic.
