# CoA roles — entity required matrix + Neon gap (2026-07-23)

**Law:** `docs/specs/DEFINITION-OF-DONE.md` · primary table `accounting.chart_of_accounts_roles`  
**Owner designations required** before Neon writes for missing/suspect binds. Cursor does not invent GL mappings.

## Required-by-entity (validate)

| Bucket | TRANSP | TRK | USMCA |
|---|---|---|---|
| Core (AR/AP/cash/undeposited/revenue/expense/RE/uncategorized/`cash_dip`) | required | required | required |
| Driver pay + recoveries + escrow | required | **not required** | required |
| Factoring secured-borrowing | required | **not required** | **not required** (launch) |
| ASC 842 lease suite | not required | required | not required |
| Property tax | required | required | required |
| `sales_tax_payable`, `cash_basis_adjustment_equity` | optional | optional | optional |

Code: `apps/backend/src/accounting/coa-roles/entity-required-roles.ts`

## Neon live (bypass lucia · prod branch) — 2026-07-23 evening

| Entity | Active roles | Missing vs entity-required (compute) |
|---|---:|---|
| TRANSP missing | `advance_recovery`, `insurance_recovery`, `fuel_advance_recovery`, `other_recovery`, `reimbursement_expense` |
| TRK | 24 | **none** vs TRK-required |
| USMCA | 18 | `cash_dip`, `expense_default`, `driver_pay_expense`, `driver_payroll_clearing`, `reimbursement_expense`, `advance_recovery`, `damage_recovery`, `lease_recovery`, `insurance_recovery`, `fuel_advance_recovery`, `other_recovery` |

## DIP resolve (cash_dip → bank.ledger_account_id)

| Entity | cash_dip CoA | Bank mask | Status |
|---|---|---|---|
| TRANSP | WF - General Operating 6103 | …6103 | **should RESOLVE** |
| TRK | BUSINESS CHECKING …3500 | …3500 | **should RESOLVE** |
| USMCA | *(none)* | …3224 → BoA Operating | **FAIL until designated** |

## Suspect binds (owner review — DoD layer D/E)

- TRANSP `cash_clearing` → Undeposited Funds (duplicates `undeposited_funds`)
- TRANSP `driver_payroll_clearing` → Driver Cash Advance (asset)
- TRANSP `damage_recovery` + `escrow_liability_default` → same 2025 escrow
- TRANSP …6129 / …6137 cash-GL names still BOA-/loan-labeled
- TRK has `driver_pay_expense` / factoring-adjacent roles despite lessor-only ops

## Owner action

1. Designate USMCA missing required roles in CoA Roles UI (esp. `cash_dip` → BoA Operating, `expense_default`, `driver_pay_expense`).
2. Confirm or correct TRANSP suspect binds.
3. Optionally deactivate TRK N/A factoring/driver roles (never delete accounts).
