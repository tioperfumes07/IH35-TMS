# CoA roles — entity required matrix + Neon gap (2026-07-23)

**Law:** `docs/specs/DEFINITION-OF-DONE.md` · primary table `accounting.chart_of_accounts_roles`  
**Owner designations:** UI (not Neon INSERT). Cursor does not invent GL mappings.

## Required-by-entity (validate)

| Bucket | TRANSP | TRK | USMCA |
|---|---|---|---|
| Core (AR/AP/cash/undeposited/revenue/expense/RE/uncategorized/`cash_dip`) | required | required | required |
| Driver pay + **used** recoveries (advance, damage, abandonment) + escrow + reimbursement | required | **not required** | required |
| Factoring secured-borrowing | required | **not required** | **not required** (launch) |
| ASC 842 lease suite (`rental_income` / `lease_receivable` / …) | not required | required | not required |
| Property tax | required | required | required |

### Optional (designatable; validate ignores)

| Role | Why optional |
|---|---|
| `sales_tax_payable` | Freight not sales-taxed (owner) |
| `cash_basis_adjustment_equity` | Cash-basis equity plug only if CPA creates dedicated account |
| `lease_recovery` | No OO / no driver lease withhold (owner 2026-07-23) |
| `insurance_recovery` | No driver insurance share recovery (owner) |
| `fuel_advance_recovery` | No fuel float advance recovery in model (owner) |
| `other_recovery` | Catch-all unused (owner) |

Code: `apps/backend/src/accounting/coa-roles/entity-required-roles.ts`  
Guard: `scripts/verify-coa-optional-unused-recoveries.mjs` (step **1410**)

## Neon live (bypass lucia · prod `br-fancy-credit-akjnd07a`) — 2026-07-23 evening (owner paste)

| Entity | Active roles | Missing vs **updated** required |
|---|---:|---|
| TRANSP | 26 | **none** (fuel/insurance/other optional; advance + reimbursement designated) |
| TRK | 24 | **none** vs TRK-required |
| USMCA | 25 | **none** (lease/fuel/insurance/other optional) |

### Suspect binds (owner review — DoD layer D/E; not blockers for validate)

- TRANSP/USMCA `cash_clearing` + `undeposited_funds` → same Undeposited Funds
- TRANSP/USMCA `driver_payroll_clearing` → Driver Cash Advance (clearing vs receivable)
- TRANSP `lease_recovery` → “Leased Trucks from IH35 TRUCKING” (**expense**, wrong role semantics — deactivate role later; keep account)
- TRK `damage_recovery` + `escrow_liability_default` → same Damage Claim Escrow
- TRK `rental_income` + `revenue_default` → same Equipment Rental Income (lessor OK if intentional)

## Owner action status

1. ~~Designate USMCA / TRANSP required roles in UI~~ **DONE** (owner 2026-07-23)
2. Optional unused recoveries → code matrix (**this fix**)
3. Suspect double-binds → CPA/owner cleanup wave (tracker; not silent Neon rewrite)
