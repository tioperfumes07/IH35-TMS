# Chart-of-Accounts Role Mapping Proposal (TRANSP)

> **STATUS: PROPOSAL ONLY — NOT APPLIED.** Nothing in this document has been
> seeded. The mapping below is a *suggestion* generated from account
> name/type/subtype matching against the live chart of accounts. **These mappings
> require bookkeeper / accountant / Jorge approval before seeding. Do not apply
> until approved.**

## Why this exists

The posting engine fails with `ACCOUNT_MAPPING_MISSING` when it cannot resolve a
role to a concrete GL account. Role resolution is currently empty for the
operating company, so postings that depend on a mapped role cannot complete.

## Which table is actually wired (corrected)

There are **two** role tables in the schema. The one the posting engine reads is
**`accounting.chart_of_accounts_roles`** — *not* `catalogs.account_role_bindings`.

Resolution order (see `apps/backend/src/accounting/coa-roles/resolver.service.ts`,
used by `apps/backend/src/accounting/posting-engine.service.ts` via
`resolveRoleAccountOptional`):

1. **`accounting.chart_of_accounts_roles`** — per-company, keyed on `role` (the
   canonical `CoaRole` vocabulary). **This is the wired/authoritative table.**
2. `catalogs.account_role_bindings` — legacy, global, keyed on `role_key`
   (`ar_clearing`, `ap_clearing`, …). Only consulted as a fallback for three
   legacy roles (`ar_control→ar_clearing`, `ap_control→ap_clearing`,
   `undeposited_funds`).
3. Heuristic fallback by account subtype/type/name hints (no stored row).

Both role tables are **empty (0 rows)** in production. `catalogs.accounts` has
**370 rows** (TRANSP chart of accounts).

### `accounting.chart_of_accounts_roles` schema (live)

| column | type | null | notes |
|---|---|---|---|
| `id` | uuid | NO | PK, `gen_random_uuid()` |
| `operating_company_id` | uuid | NO | **FK → `org.companies(id)`** — bindings are **per operating company** |
| `role` | text | NO | **CHECK** in the 11-value `CoaRole` set (below) |
| `account_id` | uuid | NO | **FK → `catalogs.accounts(id)`** |
| `is_active` | boolean | NO | resolver requires `is_active = true` |
| `created_at` / `updated_at` | timestamptz | NO | |
| `created_by_user_id` / `updated_by_user_id` | uuid | YES | FK → `identity.users(id)` |

Resolver also requires the joined account to be active and postable
(`catalogs.accounts.deactivated_at IS NULL AND is_postable = true`).

The 11 allowed `role` values (CHECK constraint): `ar_control`, `ap_control`,
`cash_clearing`, `undeposited_funds`, `revenue_default`, `expense_default`,
`factor_reserve_default`, `escrow_liability_default`, `sales_tax_payable`,
`cash_basis_adjustment_equity`, `retained_earnings`.

> Note: these are the **`chart_of_accounts_roles`** role keys. They are a
> *different vocabulary* from the legacy `catalogs.account_role_bindings.role_key`
> values (`ar_clearing`, `cash_dip`, `fuel_expense`, …). Map against the 11 keys
> above, since that is what the engine reads first.

## Proposed mapping (TRANSP — `operating_company_id = 91e0bf0a-133f-4ce8-a734-2586cfa66d96`)

Confidence: **HIGH** = unambiguous match; **MEDIUM** = reasonable but a human
should confirm which specific account; **LOW** = no good match / needs a
bookkeeper decision (possibly a new account).

| role | description (engine use) | suggested account | acct # | account_id | type / subtype | confidence | notes |
|---|---|---|---|---|---|---|---|
| `ar_control` | A/R control for invoices | **Accounts Receivable** | `1100` | `16ba4453-dfdb-4cdd-b50a-7ab3a2be57ec` | Asset / AccountsReceivable | **HIGH** | Canonical A/R. Alt: `QBO-45` "Accounts Receivable (A/R)" (`3bfa6640-cfab-4dae-b03d-8989f49ad910`). |
| `ap_control` | A/P control for bills | **Accounts Payable** | `2000` | `47c792e9-ba5b-4766-a904-4346122053eb` | Liability / AccountsPayable | **HIGH** | Canonical A/P. Alt: `QBO-47` "Accounts Payable (A/P)" (`49ecd817-4f60-408d-8cc1-3f3ad3a5b533`). |
| `undeposited_funds` | Undeposited receipts clearing | **Undeposited Funds** | `QBO-168` | `3d580499-9efb-4fed-9327-d2eb70ed9264` | Asset / UndepositedFunds | **HIGH** | Exact subtype match. |
| `retained_earnings` | Period-close retained earnings | **Retained Earnings** | `QBO-2` | `9facb3ed-ec25-48a5-84be-e89768ec3204` | Equity / RetainedEarnings | **HIGH** | Exact subtype match. |
| `revenue_default` | Default freight revenue | **Freight Revenue** | `4100` | `65ad54cd-6cc8-4f4e-8061-e1bc1009865b` | Income / SalesOfProductIncome | **HIGH** | Primary trucking revenue. Alt: `QBO-31` "Sales of Product Income". |
| `cash_clearing` | Default operating cash/clearing | **Cash - Operating** | `1000` | `2c6b8328-ee5a-4146-8d9e-586a967f9222` | Asset / Bank | **MEDIUM** | Many bank/checking accounts exist — confirm the authoritative operating account. Alts: `QBO-1150040124` "BOA-CHECKING-1135" (`941ca478-8e53-48f8-bf2c-a0633d2f317b`), `QBO-1150040141` "WF - General Operating 6103". |
| `expense_default` | Default expense for unmapped lines | **Uncategorized Expense** | `QBO-25` | `4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7` | Expense / OtherMiscellaneousServiceCost | **MEDIUM** | Safe catch-all default; bookkeeper may prefer routing to a specific expense (e.g. `6100` Fuel Expense, or a maintenance account) instead of a catch-all. |
| `escrow_liability_default` | Escrow liability holding | **Damage Claim Escrow** | `QBO-1150040187` | `d7d485bf-ad1a-4573-9ad6-badbd565e9a3` | Liability / OtherLongTermLiabilities | **MEDIUM** | Closest liability "escrow". Alts: `QBO-1150040174` "2026-Damage Claim Escrow", `QBO-250` "2025-Damage Claim Escrow". Confirm this is the intended escrow vs a factoring escrow. |
| `factor_reserve_default` | Factoring reserve liability | *(no clean match)* | — | — | resolver expects **Liability**; only **Asset** reserves exist | **LOW** | No Liability-type factoring reserve exists. Asset candidates: `QBO-1150040080` "Faro Factoring Reserves" (`14449020-5d36-45ba-8919-e6e05b9278c4`, Savings), `QBO-248` "RTS-Factoring Reserves" (`d76c02ab-...`, Savings). Bookkeeper must decide whether to map to an Asset reserve or create a Liability account. |
| `sales_tax_payable` | Sales tax payable | *(no match found)* | — | — | no SalesTaxPayable subtype / "sales tax" account | **LOW** | No sales-tax-payable account in the chart. Likely N/A for this carrier; create the account first if needed. **Manual.** |
| `cash_basis_adjustment_equity` | Cash-basis reporting adjustment (equity) | *(no clean match)* | — | — | only Equity accounts: Retained Earnings, Opening Balance Equity | **LOW** | No dedicated "cash basis adjustment" equity account. Closest is `QBO-33` "Opening Balance Equity" (`4047fbc0-4119-423c-b005-b673519c7f6d`) but semantics differ. **Manual** — create a dedicated account if cash-basis adjustments are used. |

### Summary

- **HIGH confidence (5):** `ar_control`, `ap_control`, `undeposited_funds`,
  `retained_earnings`, `revenue_default`.
- **MEDIUM confidence (3):** `cash_clearing`, `expense_default`,
  `escrow_liability_default` — defensible suggestion, confirm the exact account.
- **LOW / needs manual decision (3):** `factor_reserve_default`,
  `sales_tax_payable`, `cash_basis_adjustment_equity` — no clean match in the
  current chart; a bookkeeper should pick or create the account.

## If approved — seed shape (DO NOT RUN until approved)

This is the SQL a bookkeeper-approved seed **would** take. It is **not** part of
any migration in this PR. Replace the `account_id` placeholders with the
approved choices and run once, per operating company.

```sql
-- EXAMPLE ONLY — requires bookkeeper/accountant/Jorge sign-off before running.
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
VALUES
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', 'ar_control',        '16ba4453-dfdb-4cdd-b50a-7ab3a2be57ec', true),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', 'ap_control',        '47c792e9-ba5b-4766-a904-4346122053eb', true),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', 'undeposited_funds', '3d580499-9efb-4fed-9327-d2eb70ed9264', true),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', 'retained_earnings', '9facb3ed-ec25-48a5-84be-e89768ec3204', true),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', 'revenue_default',   '65ad54cd-6cc8-4f4e-8061-e1bc1009865b', true)
  -- cash_clearing / expense_default / escrow_liability_default: confirm exact account, then add.
  -- factor_reserve_default / sales_tax_payable / cash_basis_adjustment_equity: manual decision required.
;
```

The official UI for managing these bindings is the COA roles surface
(`apps/backend/src/accounting/coa-roles/*`); prefer that over raw SQL where
possible so the writes are audited and tenant-scoped.
