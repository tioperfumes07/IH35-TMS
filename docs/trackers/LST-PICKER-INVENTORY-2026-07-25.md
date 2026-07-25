# LST-PICKER-01/03 — Catalog picker inventory (2026-07-25)

**FINDING:** LST-PICKER-01 / LST-PICKER-03 · **Lane:** DOCS + guard ratchet  
**Law:** Addendum B / VERIFY-2 — all 7 clauses (see `00-HOUSE-LAW-AND-GIT-GATE.md` §6)

## Compliant today (ReferenceSelect / Combobox first-row `+ Add new`)

| Kind | Canonical write table | Surfaces (sample) |
|---|---|---|
| `vendor` | `mdata.vendors` | Bills, Expense, Bank categorize, Cargo claim |
| `customer` | `mdata.customers` | Invoice, Payment, Bank |
| `account` | `catalogs.accounts` | JE, Bill lines, CoA Roles, Expense payment acct |
| `category` | `catalogs.accounts` (expense leaves) | Expense Category, Bank categorize |
| `class` | `catalogs.classes` | JE, Bill, Item editor |
| `service` / `item` | `catalogs.items` | Bank categorize, line editors |

Keystone: `apps/frontend/src/components/parity/ReferenceSelect.tsx` + `Combobox` (first-row `+ Add new`).

## FAIL — catalog pickers without inline create (manage via `/lists/...` only)

These Lists catalogs are **reachable** but downstream wizards do **not** offer first-row `+ Add new` for them. Ranked for follow-up PRs (one catalog / small batch per PR):

| Domain | Catalog | Typical consumer |
|---|---|---|
| Dispatch | load_types, detention_reasons, pickup_time_types, additional_charges, load_cancellation_reasons | Book-Load / cancel |
| Driver | pay_rate_templates, deduction_types, pay_types, escrow_types, termination_reasons | Settlement / profile |
| Drivers ref | license_classes, endorsements, restrictions, medical_card_status, employment_status | CDL wizard (GLOBAL-BY-DESIGN OK for shared taxonomies; still need inline create UX if create is allowed) |
| Maintenance | failure_codes, labor_codes, priority_levels, shop_locations, work_order_statuses | WO create |
| Fuel | card_types, exception_types, station_brands, … (12) | Fuel wizards |
| Fleet | tractor/trailer statuses, condition codes, ownership, trailer_types, lease_terms, asset_* | Fleet / unit create |
| Safety | internal_fine_reasons, civil_fine_types, company_violation_types, complaint_types, dot_violation_types, cargo_claim_reasons | Safety creators |
| Accounting | payment_terms, payment_methods, tax_codes, journal_entry_types (RO), posting_templates (RO) | Customer/vendor terms; JE type |

## Acceptance for closing LST-PICKER-01/03

1. Inventory above stays honest (update this file when a batch lands).
2. Shared capability (ReferenceSelect config or catalog-picker wrapper) meets all 7 clauses.
3. Guard `verify-universal-picker-law` (verify-step 1450) ratchets the keystone + forbids mirror writes on registered kinds.
4. Sampled browser create-appears on tio-perfumes for each newly wired kind.

## Related closed leftovers

- LST-PICKER-02 items: #3442 + verify-step 1433  
- LST-F06 expense category mirror: PR #3466 + verify-step 1445  
