<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

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

---

# LINKAGE LAW §10-B — THE COMPLETE TARGET LIST (owner law 2026-10-01 11:25 CT / 16:25Z — "update all law docs so nothing is ever left out again")

Every record a coder creates, migrates, posts or renders links BOTH WAYS (forward FK on the record, reverse drill from the target) to EVERY applicable target below. A block that does not declare each target as LINKED or N/A(reason) is not done. Silence is a defect. This list is canonical in docs/trackers/01-LINKAGE-LAW.md and mirrored verbatim into every law doc; a change is made in all of them in the same commit.

**Parties:** customer (mdata.customers) · vendor (mdata.vendors) · driver (mdata.drivers; drivers-as-vendors where they are paid) · factoring company (vendor) · lessor/lessee (org.companies + vendor/customer) · user/actor (identity.users).
**Assets & operations:** unit/truck (mdata.units) · trailer/equipment (mdata.equipment) · load (mdata.loads, canonical hub) · stop (mdata.load_stops) · tour (dispatch tours) · pre-settlement link (presettlement_link) · settlement (driver_finance.driver_settlements) · driver bill (driver_finance.driver_bills) · work order (maintenance.work_orders) · fuel transaction (fuel.fuel_transactions) · insurance policy / claim · safety event / incident · legal contract / contract instance / legal matter · lease contract (accounting.lease_contract) · document (docs.files / documents.attachments).
**Money:** invoice + invoice line (A/R subledger; accounting.invoices / invoice_lines) · customer payment + application · bill + bill line + bill payment (A/P subledger; accounting.bills / bill_lines / bill_payments) · expense + expense line · chart-of-accounts account (catalogs.accounts; income / expense category / control role) · item or product/service (items) · class (catalogs.classes) · journal entry + postings (accounting.journal_entries / journal_entry_postings, source_transaction_type + id + line id) · bank line (banking.bank_transactions match + categorization) · deposit · transfer · factoring purchase / advance / reserve (escrow + cash) / fee / chargeback · escrow / cash advance / deduction / reimbursement · period (open/closed).
**Stamps (every record):** created_at + created_by · updated_at + updated_by · the business dates that apply (pickup, delivery, issue, due, sent, signed, start, end, commencement, posted, paid, cleared, wire, purchase, voided, reinstated, closed, locked, approved) · operating_company_id on every table with FORCED RLS (identity.is_lucia_bypass() OR app.operating_company_id) · one audit row (audit.audit_events / audit.row_changes, WORM) per mutation · trace_no / trace_key where the table carries them.
**Mechanics:** server-generated display ids · pickers are ReferenceSelect with the full catalog dropdown + inline +Create (customer, vendor, driver, unit, trailer, account, item, class) · multi-select where the document covers several assets (a lease covers many units and trailers) · MoneyInput for money, DatePicker for dates · EntityLink on every rendered id · click on any payment received/made opens that transaction and its bank match (QuickBooks parity) · PDF print design per document type (contract, lease, invoice, settlement, purchase report) created, printable and sendable from the app · FEED GATE (driver_finance.feed_intakes / feed_intake_checks) runs before a fed subject closes.
**Never:** payroll.* · settlement.* · bank.* · maint.* · accounting.qbo_* · mdata.qbo_vendors · catalogs.cancellation_reasons (RETIRE tables) · test/sample/demo rows in USMCA · a money line without an account · a document without its line · a status without its stamp · a mutation without its audit row.
