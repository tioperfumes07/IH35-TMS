# BLOCK TXH-04 — TRANSACTION HEALTH: THE COMPLETE LINK INVENTORY
### Make the wiring map show every relationship a document can have. Owner-reported, 2026-08-29.

**Standard:** `docs/lockdown/SUBSCRIPTION-GRADE-DEFINITION-OF-DONE-2026-08-29.md`
**Meta-rule:** `docs/lockdown/HONESTY-PROGRAM-2026-08-29.md` — registry-driven, planted selftest, fail closed.

---

## WHAT THE OWNER SAW (both reproduced and root-caused)

**Invoice `L-20260828-0022`** — status FAIL, and the detail pane shows:
- an **empty ledger box with `✓ balanced`** under it, while the header says `UNPOSTED`
- `✕ Journal entry (missing)` · `Load (n/a)` · Customer
- no truck, no trailer, no expense type, no terms, no factor

**Factoring batch `BATCH-20260828-053812-5U73`** — status FAIL:
- same empty ledger with `✓ balanced`, header `UNPOSTED`
- `✕ Journal entry (missing)` · **`✕ Vendor (missing)`**
- no factor, no amounts, no invoices in the batch

## THE FOUR DEFECTS

### D1 — Only 6 of 12 declared hub tables can EVER be drawn
`transaction-health-evidence.ts` emits exactly six labels: Bill, Customer, Driver, Journal entry,
Load, Vendor. Measured against the linkage law's twelve hubs:

| DRAWN | NOT DRAWN |
|---|---|
| `mdata.drivers` · `mdata.loads` · `mdata.customers` · `mdata.vendors` · `accounting.journal_entries` · `catalogs.accounts` | **`mdata.units` (truck)** · **`mdata.equipment` (trailer)** · `maintenance.work_orders` · `docs.files` · `org.companies` · `identity.users` |

Truck, trailer, work order and documents **cannot appear** — nothing produces them.

### D2 — `✓ balanced` on an empty ledger of an UNPOSTED document
0 = 0 is technically balanced and completely misleading. **This is a fake green in the exact screen
built to eliminate fake greens.** An unposted document must say so; it must not display an empty
ledger with a green tick.

### D3 — `✕ Vendor (missing)` on a factoring batch is a FALSE FAILURE
Verified against the schema: `factoring.batch` has exactly **two** foreign keys — `factor_id →
factoring.factor` and `tenant_id → org.companies`. **There is no vendor relationship on a factoring
batch and there never was.** The screen reports a missing link that cannot exist, and omits the one
that does (Factor). A false ✕ is worse than a blank: it sends someone hunting a defect that isn't there.

### D4 — `Load (n/a)` on an invoice that has a load FK
`accounting.invoices.source_load_id → mdata.loads` exists. `n/a` is wrong; it must resolve, or show
`missing` if genuinely null.

---

## THE INVENTORY — every label, per document type, verified from `pg_constraint`

Legend — **R** required (a `missing` here is a real defect) · **O** optional (absent = `not_applicable`) ·
**L** resolved through the document's line rows.

### invoice — `accounting.invoices`
| Label | Source | Target | Req |
|---|---|---|---|
| Customer | `customer_id` | `mdata.customers` | R |
| Load | `source_load_id` | `mdata.loads` | R |
| Journal entry | revenue-latch JE | `accounting.journal_entries` | R when posted |
| Factor | `factor_profile_id` | `factoring.factor` | O |
| Factoring advance | `factoring_advance_id` | `accounting.factoring_advances` | O |
| Payment terms | `payment_terms_id` | `catalogs.payment_terms` | R |
| Revenue account | `invoice_lines.account_id` | `catalogs.accounts` | L · R |
| Item | `invoice_lines.item_id` | `catalogs.items` | L · O |
| Line load | `invoice_lines.source_load_id` | `mdata.loads` | L · O |
| Entity | `operating_company_id` | `org.companies` | R |
| Created by | `created_by_user_id` | `identity.users` | R |
| **Driver · Unit · Trailer** | **via the linked Load** | transitive | **O — resolve through the load, label `via Load`** |

### bill — `accounting.bills`
| Label | Source | Target | Req |
|---|---|---|---|
| Vendor | `mdata_vendor_id` | `mdata.vendors` | R |
| Unit (truck) | `unit_id` | `mdata.units` | O |
| Work order | `linked_work_order_uuid` | `maintenance.work_orders` | O |
| Insurance claim | `insurance_claim_id` | `insurance.claim` | O |
| Legal matter | `legal_matter_id` | `legal.matters` | O |
| Class | `class_id` | `catalogs.classes` | O |
| Bank transaction | `source_bank_transaction_id` | `banking.bank_transactions` | O |
| Expense category | `bill_lines.expense_category_uuid` | `catalogs.expense_categories` | L · R |
| Expense account | `bill_lines.account_id` | `catalogs.accounts` | L · R |
| Line load | `bill_lines.load_id` | `mdata.loads` | L · O |
| Journal entry | AP posting | `accounting.journal_entries` | R when posted |
| Entity · Created by | | `org.companies` · `identity.users` | R |

### bill_payment — `accounting.bill_payments`
| Label | Source | Target | Req |
|---|---|---|---|
| Bill | `bill_id` | `accounting.bills` | R |
| Payment account | `cc_account_id` | `catalogs.accounts` | R |
| Bank transaction | `source_bank_transaction_id` | `banking.bank_transactions` | O |
| Vendor | **via the Bill** | `mdata.vendors` | R · `via Bill` |
| Journal entry | | `accounting.journal_entries` | R when posted |
| Entity · Created by | | | R |

### customer_payment — `accounting.payments`
| Label | Source | Target | Req |
|---|---|---|---|
| Customer | `customer_id` | `mdata.customers` | R |
| Bank transaction | `source_bank_transaction_id` | `banking.bank_transactions` | O |
| Invoice(s) applied | application rows | `accounting.invoices` | R |
| Journal entry · Entity · Created by | | | R |

### expense — `accounting.expenses` *(the richest — this is where truck/trailer/driver live)*
| Label | Source | Target | Req |
|---|---|---|---|
| Vendor | `vendor_uuid` | `mdata.vendors` | O |
| Driver | `driver_uuid` | `mdata.drivers` | O |
| Unit (truck) | `unit_id` | `mdata.units` | O |
| **Trailer** | `trailer_id` | **`mdata.equipment`** | O |
| Load | `load_id` | `mdata.loads` | O |
| Work order | `linked_work_order_uuid` | `maintenance.work_orders` | O |
| Insurance claim | `insurance_claim_id` | `insurance.claim` | O |
| Legal matter | `legal_matter_id` | `legal.matters` | O |
| Payment account | `payment_account_uuid` | `catalogs.accounts` | R |
| Recovery deduction type | `recover_deduction_type` | `catalogs.driver_deduction_types` | O |
| Journal entry | `journal_entry_id` | `accounting.journal_entries` | R when posted |
| Reversing JE | `reversed_by_je_id` | `accounting.journal_entries` | O |
| Entity · Created by · Updated by · Voided by | | | R / O |

### journal_entry — `accounting.journal_entries`
| Label | Source | Target | Req |
|---|---|---|---|
| JE type | `journal_entry_type_id` | `catalogs.journal_entry_types` | R |
| Reverses | `reverses_je_id` | `accounting.journal_entries` | O |
| Reversed by | `reversed_by_je_id` | `accounting.journal_entries` | O |
| Source document | `transaction_source_links` | 20 types | R |
| Accounts | posting lines | `catalogs.accounts` | L · R |
| Entity · Created by · Voided by | | | R / O |

### factoring_batch — `factoring.batch` *(only 2 FKs — see D3)*
| Label | Source | Target | Req |
|---|---|---|---|
| **Factor** | `factor_id` | `factoring.factor` | **R** |
| Entity | `tenant_id` | `org.companies` | R |
| Invoices in batch | `invoice_ids` (array) | `accounting.invoices` | R |
| Journal entry | factoring posting | `accounting.journal_entries` | R when posted |
| **Vendor** | — | — | **`not_applicable` — NO FK EXISTS. Never render ✕.** |
| Driver · Unit · Trailer · Load | — | — | `not_applicable` |

**Batch amounts must render** (all on the row today, none displayed):
`total_face_cents` · `advance_rate` · `expected_advance_cents` · `fee_rate` · `expected_fee_cents` ·
`status` · `submitted_at` · `funded_at`

### settlement — `driver_finance.driver_settlements`
| Label | Source | Target | Req |
|---|---|---|---|
| Driver | `driver_id` | `mdata.drivers` | R |
| First load / Last load | `first_load_id` / `last_load_id` | `mdata.loads` | O |
| Line loads | `settlement_lines.load_id` | `mdata.loads` | L · O |
| Source driver bill | `settlement_lines.source_driver_bill_id` | `driver_finance.driver_bills` | L · O |
| Deduction policy | `settlement_lines.auto_deduction_policy_id` | `driver_finance.auto_deduction_policies` | L · O |
| Split partner | `settlement_lines.split_partner_driver_id` | `mdata.drivers` | L · O |
| Team | `settlement_lines.team_id` | `mdata.driver_teams` | L · O |
| Disputed by / resolved by / approved by | | `mdata.drivers` · `identity.users` | O |
| Journal entry · Entity | | | R when posted |
| Unit · Trailer | via each line's Load | transitive | O · `via Load` |

---

## BUILD

### 1. The registry — `docs/specs/system/TXH-LINK-INVENTORY.json`
One entry per document type × label, carrying: `label`, `source` (column or `line:<table>.<col>` or
`via:<label>`), `target_type`, `requirement` (`required` | `optional` | `not_applicable`), `group`
(`GENERAL LEDGER` | `MASTER DATA` | `OPERATIONS` | `PEOPLE` | `DOCUMENTS`).

**This registry is the law.** The evidence builder reads it; it does not hardcode labels.

### 2. Rewrite `transaction-health-evidence.ts` to be registry-driven
For every entry: resolve → `wired` (with `target_label` for the chip) · null + required → `missing` ·
null + optional → `not_applicable` · `not_applicable` in the registry → **never rendered as ✕** ·
FK present but blocked by RLS/constraint → `blocked_by_constraint`.

Add **transitive resolution** (`via:`) so an invoice shows Driver / Unit / Trailer *through* its load,
labelled `via Load` — the owner asked for truck and trailer on documents that reach them indirectly.

### 3. Fix the ledger box (D2)
`gl: null` or zero lines → render **"NOT POSTED — no journal entry exists for this document"** and the
reason. **Never `✓ balanced` on an empty table.** `✓ balanced` renders only when there is at least one
line and DR = CR.

### 4. Per-type economic fields
Each document type declares the fields its detail pane must show — factoring's face / advance rate /
expected advance / fee rate / expected fee / status / submitted / funded; expense's total and payment
account; settlement's gross, deductions, net. Registry-driven, same file.

### 5. THE GUARD — `scripts/verify-txh-link-inventory-complete.mjs`
Registry-driven, fails closed:
- every one of the **12 hub tables** appears for every document type as `required`, `optional`, or an
  explicit `not_applicable` — **a hub that is absent for a type FAILS** (this is what let truck and
  trailer silently vanish)
- every registry `source` column **exists in the live schema** (catches a renamed FK)
- every FK on each document table **appears in the registry** — new FK with no entry FAILS
- the evidence builder references the registry and hardcodes **no** label literals
- the UI renders all five states including `blocked_by_constraint`

**`--selftest` plants and must catch each:** remove `trailer_id` from expense · mark factoring Vendor
`required` (must fail — no FK exists) · empty ledger with `balanced: true` · a hub absent for a type ·
a registry source naming a column that does not exist · a hardcoded label in the builder.

---

## DONE

Open `/system?tab=tx-health` on the live SHA. The invoice shows Customer, Load, terms, revenue account,
and Driver/Unit/Trailer via the load. The factoring batch shows **Factor**, its invoices, and all five
amounts — and **no Vendor ✕**. An unposted document says NOT POSTED instead of `✓ balanced` over an
empty box. Every missing link is genuinely missing; every ✕ is real.

```
PROVES-IT-WORKS:  verify-txh-link-inventory-complete --selftest, all 6 plants caught; live walk of
                  both owner-reported documents shows the full label set
KEEPS-IT-TRUE:    registry-driven + schema-existence check — a new FK or a renamed column fails the gate
DERIVED-SURFACES: TXH detail pane · wiring map · status computation
REVERSAL:         n/a — read-only screen, computed at read time, nothing stored
BINDING:          live healthz SHA at walk time
COVERAGE:         docs/specs/system/TXH-LINK-INVENTORY.json — a doc type or hub with no entry FAILS
```

MIGRATE: N/A · KEEP TEST · never `trigger_deploy`
