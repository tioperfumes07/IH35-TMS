# VERIFIED LINKAGE BACKBONE — prod truth for every table the blocks reference (2026-07-25)

GUARD-verified on Neon `tiny-field-89581227` (lucia), 2026-07-25. Every block's Rule-14 LINKAGE declaration
draws its canonical-target proof from this table. **Classification is by opco VALUES + policy, never column
presence** (the lesson from complaint_types + detail_types). Re-run any row before you freeze it.

## Scoping classification key
- **PER-ENTITY** = has `operating_company_id`, values populated per entity, policy `= GUC`. → `companyScoped:true`.
- **SHARED-CANONICAL** = has opco but all values NULL, policy `opco IS NULL OR = GUC`. → `companyScoped:false` (scoping counts 0).
- **GLOBAL (no opco)** = no opco column. → `companyScoped:false`. RLS may be off, or forced with a role/global-read policy.
- **ROLE-GATED** = has/lacks opco but the policy gates by `current_user_role()`, not by entity. Not entity-isolated.

## Catalogs
| table | exists | has_opco | opco values | rls forced | policy kind | classification |
|---|---|---|---|---|---|---|
| `complaint_types` | ✓ | yes | 295 pop / 0 null | yes | `= GUC` | **PER-ENTITY** |
| `load_cancellation_reasons` | ✓ | yes | 63 pop / 0 null | yes | `= GUC` | **PER-ENTITY** (canonical for cancels) |
| `accounts` | ✓ | yes | 1392 pop / 0 null | yes | `= GUC` | **PER-ENTITY** (CoA) |
| `items` | ✓ | yes | 236 pop / 0 null | yes | `= GUC` | **PER-ENTITY** |
| `expense_categories` | ✓ | yes | 9 pop / 0 null | yes | `company_scope = GUC` | **PER-ENTITY** |
| `account_role_bindings` | ✓ | yes | **0 rows** | yes | **role-based** (Owner/Admin/Mgr/Acct) | ROLE-GATED, empty — LST-F09 |
| `detail_types` | ✓ | yes | 0 pop / 144 null | yes | `opco IS NULL OR = GUC` | **SHARED-CANONICAL** (exclude) |
| `payment_terms` | ✓ | **no** | — | yes | role-based | **GLOBAL (no opco)** — LST-F03 = owner design Q |
| `posting_templates` | ✓ | **no** | — | yes | role-based | **GLOBAL (no opco)** — LST-F03 = owner design Q |
| `journal_entry_types` | ✓ | no | — | yes | global-read | **GLOBAL (no opco)** (exclude) |
| `tire_positions` | ✓ | no | — | yes | global-read | **GLOBAL (no opco)** (exclude) |
| `account_types` | ✓ | no | — | **off** | — | **GLOBAL, RLS-off** (exclude) |
| `wo_cancellation_reasons` | ✓ | no | — | **off** | — | **GLOBAL, RLS-off** (exclude) |
| `cancellation_reasons` | ✓ | no | — | **off** | — | **GLOBAL, RLS-off — RETIRE (9-row legacy)** |

## Accounting (all exist, RLS forced)
| table | has_opco | note |
|---|---|---|
| `expenses` | yes | QBO-projection subledger target (ACCT-ECON-04) |
| `payments` | yes | AR-payment projection target (ACCT-ECON-03) |
| `vendor_credits` | yes | vendor-credits projection target (ACCT-ECON-05) |
| `bill_payments` | yes | working projection (6,479, source_system='qbo', 0 GL) |
| `bills` | yes | header; reverse-density target (ACCT-F04) |
| `bill_lines` | **no** | child of bills — scopes via `bill_id` parent (correct; not a defect) |
| `journal_entries` | yes | JE ledger; matched-JE + JE-type FK target |

## Banking (all exist, RLS forced, all have opco)
`bank_transactions`, `transfers`, `reconciliation_sessions`, `bank_accounts` — all `has_opco:true`, RLS forced.

## mdata (all exist, RLS forced, all have opco)
`qbo_purchases`, `qbo_ar_payments`, `qbo_items`, `qbo_accounts` (canonical QBO mirror — puller-owned; projections READ these), `vendors` (canonical AP truth).

## RETIRE reminder (never write/FK the left)
`catalogs.cancellation_reasons` (→ per LST-F17 ruling A: `load_cancellation_reasons`), `mdata.qbo_*` is the mirror not a write target from projections’ perspective (write `accounting.*`), `bank.*`→`banking.*`, `maint.*`→`maintenance.*`, `payroll.*`/`settlement.*`→`driver_finance.*`.

## Errors this backbone corrected in the packet
1. **Block 05:** `payment_terms`/`posting_templates` have NO opco → they are global/role-gated, NOT "entity-blind, scope them." Whether they should be per-entity is an OWNER design decision. Only `account_role_bindings` (LST-F09) is a real per-entity fix (role-gated + empty + global UNIQUE).
2. **Block 14:** `detail_types` is shared-canonical (opco all-NULL) → excluded. (Already corrected.)
3. **Block 01:** `complaint_types` had no `deactivated_at`; it was pollution not a seed gap. (Already corrected + fixed on prod.)
