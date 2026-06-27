# Account Register — verify-first gap analysis (QBO-parity)

> 2026-06-27. STEP-0 verify-first per the register dispatch. The register is **already built and live**;
> this maps what exists vs the spec (`QBO_PARITY_UI_SYSTEM_v2_v3.md` BLOCK B / CA-05) and surfaces the
> spec-defined GATES before any build, so we enhance — not rebuild — and don't trip a gated decision.

## What EXISTS today (do NOT rebuild)
Live at **`/accounting/account-register`** (D5 / CA-05, shipped #976), read-only:
- Backend `account-register.service.ts` + `.routes.ts` (+ unit test). Reads
  `accounting.journal_entry_postings` JOIN `accounting.journal_entries`, opening balance from the
  **canonical `accounting.fn_account_balances_as_of`** (reuses existing GL math — no new math).
- **Running balance + sign convention is CORRECT** (the #1 risk): natural-sign per `normal_balance`
  (debit-normal rises on debit; credit-normal rises on credit). Voided JEs excluded.
- Columns: **Date · Type · Reference · Memo · Debit · Credit · Running balance**. Opening/closing +
  period total debit/credit (KPI cards). CSV export. Filters: date range (presets + picker), type, search.
- **Entity-scoped** (`operating_company_id` + `account_id` params; RLS).

## Spec target (BLOCK B / CA-05) — the QBO columns
`Date · Ref No. · Payee · Memo · Class · Payment · Deposit · Tax · BALANCE(running) · Type · Account
(counter/split) · Location` + status `C/R`, "Reconciled through <date>" banner, row→drill-through, markers
("-Split-", settlement# in Bill Payment memo). Inline-edit/posting = **financial-gated** (out of v1).

## GAP — additive, read-only display (safe to build once gates resolved)
| Spec column / behavior | Status | Build note |
|---|---|---|
| Date · Memo · running Balance · Type · Ref | ✅ present | — |
| Debit/Credit → **Payment/Deposit** (or Increase/Decrease) labeling | ⚠️ labeled Debit/Credit | relabel per account type |
| **Payee/Name** | ❌ missing | derive from source txn (bill→vendor, invoice→customer, payment) |
| **Account (counter/split)** | ❌ missing | other JE posting(s); "-Split-" if >1 |
| **Class** · **Location** · **Tax** | ❌ missing | from posting/source if present |
| **Status C/R** + "Reconciled through" banner | ❌ missing | from bank reconciliation state (bank accounts only) |
| **Row drill-through** to source transaction | ❌ missing | read-only navigation to bill/invoice/JE/payment |
| Density toggle (qbo-parity grammar) | ❌ missing | shared table grammar |
| CI guard (route, columns, RLS-scoped, cents) | ❌ missing | static guard |

## GATES the SPEC itself defines (resolve BEFORE building columns)
1. **DATA-SOURCE (spec Task 0, Jorge-GATED).** The spec line 88 says the CoA page **and the CA-05
   register** must point at the **QBO-mirror dataset** (~199/385 accounts via `/api/v1/mdata/accounts`),
   not the local seed — but this is "**GATED for Jorge before changing**." The current register reads
   `catalogs.accounts` via `fn_account_balances_as_of`. **Building Payee/counter-account columns now, then
   re-sourcing the dataset, = rework.** Decide the data source first.
2. **AF-1 pairing.** Per-entity correctness is only fully real after AF-1 (#1528) lands. The register is
   entity-scoped today, but the account set it iterates becomes per-entity post-AF-1.
3. **"GATED read" + already-live vs feature-flag.** `00_INDEX` marks CA-05 a "GATED read". The dispatch
   says build behind a flag default OFF — but the register is **already shipped live without a flag**.
   Adding an OFF flag would **hide a working feature** (violates additive-only / archive-never-delete).
   Decide: leave it live (enhance in place) **or** gate new columns behind a flag while the existing
   register stays live.
4. **Counter-account = "-Split-" semantics + Payee derivation** read across `bills`/`invoices`/`payments`
   by `source_transaction_id` — a read-only join, but it's new query surface; confirm the join targets
   once the data source (gate 1) is fixed.

## Recommendation (sequence)
1. **You decide gate 1 (data source) + gate 3 (flag vs live).** These are spec-gated, not coder calls.
2. Then I build the additive read-only columns in one PR: **counter/split Account + Payee + Class/Location +
   Status + row drill-through + density + CI guard**, reusing the existing canonical balance/sign logic
   (no new GL math), entity-scoped, with a side-by-side vs the live QBO register.
3. Final per-entity verify after AF-1 (#1528) merges.

_Nothing built or changed by this analysis — verify-first only. The register's running-balance/sign core is
already correct and will be reused, not rewritten._
