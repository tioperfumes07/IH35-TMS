# GL / Ledger Map — the canonical structure (verified against db/migrations + live GUARD)

**Status:** confirmed 2026-06-18 (GUARD live-verified against `/catalogs/accounts`: 200+ accounts,
185/200 carry `qbo_account_id`, 198 postable). This doc is the durable answer to "how is the general
ledger structured in this software." Schema truth = `db/migrations/`. When this doc and a memory/handoff
disagree, re-verify against the migrations and update this doc.

---

## 1. THE LEDGER (the real double-entry books — the system of record we are building)

```
catalogs.accounts ............. THE Chart of Accounts (the GL posting chart).
  id (uuid PK)                  account_number (UNIQUE), account_name
  account_type ∈ {Asset, Liability, Equity, Income, Expense,
                  CostOfGoodsSold, OtherIncome, OtherExpense}
  account_subtype, parent_account_id (self-ref tree / sub-accounts)
  qbo_account_id (UNIQUE, nullable) ...... THE BRIDGE to QBO
  is_postable, deactivated_at, opening_balance_cents, currency_code
  operating_company_id (FK org.companies) . ENTITY OWNERSHIP — see §2 (NOT global)
  system_purpose (text, nullable) ......... per-entity system-account anchor (Stage 4 convergence)
        ▲
        │ account_id (FK)  — every ledger posting hits a catalogs.accounts row
        │
accounting.journal_entries ..... JE header. per-company (operating_company_id).
  entry_date, status ∈ {posted, voided}, source ∈ {manual, auto}
  qbo_journal_entry_id, qbo_sync_pending, void_* metadata
        ▲
        │ journal_entry_uuid (FK, ON DELETE CASCADE)
        │
accounting.journal_entry_postings  the debit/credit LINES (the double entry).
  account_id → catalogs.accounts   debit_or_credit ∈ {debit, credit}   amount_cents > 0 (CHECK)
  class_id → catalogs.classes      entity_uuid (loose link: vendor/driver/etc.)   line_sequence
```

## 2. catalogs.accounts IS ENTITY-SCOPED (not global) — Path B

The original `0010_catalogs_init.sql` created `catalogs.accounts` with **no** company column. The
multi-entity Path-B work changed that:
- **`202606161000_..._entity_columns_stage1.sql`** — ADD `operating_company_id` (nullable, FK
  `org.companies`) + `system_purpose` (nullable). Additive, no backfill yet.
- **`202606161100_..._backfill_transp_stage2.sql`** — backfill **370** rows
  (365 QBO import + 5 non-QBO operational: 1000 Cash, 1100 AR, 2000 AP, 4100 Freight Revenue, 6100 Fuel)
  → **TRANSP** (resolved by `code='TRANSP'`, prod id `91e0bf0a`). Retired dup `#6999` stays NULL.
- Future: Stage 3 decommingle TRANSP/TRK control accounts (reverse-and-repost, no UPDATE on the ledger);
  Stage 4 per-entity `UNIQUE (operating_company_id, system_purpose)`; Stage 5 seed USMCA's own chart.

**Hard rule (TRK/TRANSP/USMCA independence):** any account resolution — including category resolution
for expenses — MUST be **scoped to the row's `operating_company_id`**. Never resolve a QBO account into
another entity's ledger. The live `/catalogs/accounts` API enforces this (400 without
`operating_company_id`).

## 3. SEMANTIC POINTERS INTO THE LEDGER (find the right account by meaning, not hardcoded id)

```
accounting.chart_of_accounts_roles ... per-company role → account_id (catalogs.accounts).
  role ∈ {ar_control, ap_control, cash_clearing, undeposited_funds, revenue_default,
          expense_default, factor_reserve_default, escrow_liability_default,
          sales_tax_payable, cash_basis_adjustment_equity, retained_earnings}
          (+ uncategorized_expense added in the GAP-EXPENSES Phase-2 seed work)

accounting.expense_category_account_map ... per-company category → account_id.
  category_kind ∈ {fuel, maintenance, driver_pay, factoring_fee, toll, escrow,
                   insurance, office, other}   category_code   posting_side ∈ {debit, credit}
```

## 4. QBO MIRRORS (read-only reflections of QBO — NOT the ledger; display/reconcile only)

```
mdata.qbo_accounts ... per-company (operating_company_id, qbo_id UNIQUE). qbo_id, name,
                       account_type, active, payload_json. ← feeds the Record-Expense Category
                       dropdown and other QBO pickers.
accounting.coa_account ... second QBO mirror (0265 ps_mirror). reconciliation snapshot.
```

**The bridge mirror → ledger:** `catalogs.accounts.qbo_account_id = <mirror>.qbo_id`, **AND** scoped to
the same `operating_company_id`. A QBO account present in a mirror may not yet exist in that entity's
ledger chart → that is a **chart-of-accounts migration gap**, surfaced (rejected), never silently
auto-created (an unverified auto-created account is what breaks the eventual 99.9% reconciliation).

## 5. CoA-migration completeness metric (per entity)

`bridged = count(catalogs.accounts WHERE operating_company_id = E AND qbo_account_id IS NOT NULL)`
vs `qbo_total = count(mdata.qbo_accounts WHERE operating_company_id = E AND active)`.
GUARD (TRANSP, 2026-06-18): ~185/200 ledger accounts bridged; ~15 are app-native (no QBO counterpart,
expected — e.g. `cash_basis_adjustment_equity`), not gaps. Completing this 1:1 map per entity is the
foundation the reconciliation needs and closes the expense-resolution coverage gap.
