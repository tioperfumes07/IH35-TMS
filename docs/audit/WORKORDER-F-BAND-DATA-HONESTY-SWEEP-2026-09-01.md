# WORKORDER — F-Band Data Honesty Sweep (TRANSACTION HEALTH REGISTER)

**Owner:** DEVIN-A (data sweep, chrome-only lane) → CC-2 (builds the checks)
**Date:** 2026-09-01
**Law:** docs/bus/LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md (commit 927825a)
**Scope:** F1 (is_sample_data propagation) + F2 (test-named accounts and master data)
**Neon project:** tiny-field-89581227, bypass_rls=lucia, 2026-09-01

## F2 — TEST-NAMED ACCOUNTS (catalogs.accounts)

### Register baseline: 6 accounts across 3 drivers
### LIVE FINDING: 24 test-named accounts, 1 with GL balance

The register named 6 accounts (3 test drivers × 2 paired accounts each). The exhaustive sweep finds **24 test-named accounts** across multiple naming patterns. All are USMCA (operating_company_id = 5c854333...). One carries a real GL balance.

#### Accounts with GL balance (BLOCKING — cannot delete until reversed)

| Account # | Account Name | Type | GL Balance | Postings | Status |
|---|---|---|---|---|---|
| DRIVERCASHAD896665-023 | Driver Cash Advance- TEST CODEX ONBOARD 20260824 | Asset | **$1,200.00** | 5 | ACTIVE |

The $1,200 balance comes from BILL-2026-00016 ($1,200 debit, 2026-08-27) partially offset by an expense reversal ($500 credit) and a bill reversal ($50 credit) and a $50 expense posting and a $5 bill posting. The net is $1,200.00 debit.

#### Active test-named accounts (no GL balance, 0 postings)

| Account # | Account Name | Type |
|---|---|---|
| 2100-00-016 | CC3TEST Verify20260822 — Driver Escrow (hired unknown) | Liability |
| 2100-00-013 | CODEX ACTIVE FLEET TEST 20260821 — Driver Escrow (hired unknown) | Liability |
| 2100-00-012 | CODEX FLEET TEST 20260821 — Driver Escrow (hired unknown) | Liability |
| 2100-00-021 | CODEX TEST 0034 Driver — Driver Escrow (hired unknown) | Liability |
| 2100-00-020 | CODEX TEST Go0034 — Driver Escrow (hired unknown) | Liability |
| DRIVERCASHAD896665-022 | Driver Cash Advance- CC3TEST Verify20260822 | Asset |
| DRIVERCASHAD896665-019 | Driver Cash Advance- CODEX ACTIVE FLEET TEST 20260821 | Asset |
| DRIVERCASHAD896665-018 | Driver Cash Advance- CODEX FLEET TEST 20260821 | Asset |
| DRIVERCASHAD896665-027 | Driver Cash Advance- CODEX TEST 0034 Driver | Asset |
| DRIVERCASHAD896665-026 | Driver Cash Advance- CODEX TEST Go0034 | Asset |
| DRIVERCASHAD896665-024 | Driver Cash Advance- TEST CODEX 18756 | Asset |
| DRIVERCASHAD896665-025 | Driver Cash Advance- TEST CODEX GO0034 | Asset |
| 2100-00-018 | TEST CODEX 18756 — Driver Escrow (hired unknown) | Liability |
| 2100-00-019 | TEST CODEX GO0034 — Driver Escrow (hired unknown) | Liability |
| 2100-00-017 | TEST CODEX ONBOARD 20260824 — Driver Escrow (hired unknown) | Liability |
| 9901 | ZZ-SAMPLE A USMCA_GATEB_SAMPLE_2026-08-07 | Expense |
| 9902 | ZZ-SAMPLE B USMCA_GATEB_SAMPLE_2026-08-07 | Equity |

#### Deactivated test-named accounts (already archived, 0 postings)

| Account # | Account Name | Type | Deactivated |
|---|---|---|---|
| ARCHIVED-TEST-05cf308d | CC2-BATTERY-20260807 account_name | Asset | 2026-08-16 |
| DRIVERCASHAD896665-005 | Driver Cash Advance- SAMPLE Cascade-1612 | Asset | 2026-08-16 |
| DRIVERCASHAD896665-004 | Driver Cash Advance- SAMPLE Cascade-2042 | Asset | 2026-08-16 |
| DRIVERCASHAD896665-001 | Driver Cash Advance- TEST DRIVER-USMCA | Asset | 2026-08-16 |
| DRIVERCASHAD896665-003 | Driver Cash Advance- TEST Driver-One-20260806 | Asset | 2026-08-16 |

#### False positive (NOT test data — legitimate business)

| Account # | Account Name | Type | Note |
|---|---|---|---|
| QBO-1150040105 | Antidoping-Drug Test Services | Expense | Real QBO account — "Drug Test" is a business service, not test data |

#### Summary for CC-2's check

- **F2 baseline count: 24** (not 6)
- **1 account with GL balance** ($1,200.00) — must be reversed before deactivation
- **17 active accounts with 0 balance** — safe to deactivate after owner ruling
- **5 already deactivated** — archived but still in the chart
- **1 false positive** (Antidoping-Drug Test Services) — the check must exclude legitimate "Drug Test" business names
- **DO NOT DELETE ANY** — deactivate only, per Rule 07 (never delete, only add). Reversing the $1,200 GL balance is an owner ruling.

---

## F2 — TEST-NAMED MASTER DATA

### mdata.drivers: 20 test-named drivers

| First Name | Last Name | Status | Deactivated | Entity |
|---|---|---|---|---|
| CC3TEST | Verify20260822 | Probation | null | USMCA |
| CODEX | ACTIVE FLEET TEST 20260821 | Active | null | USMCA |
| CODEX | AUDIT-SPINE-DRIVER-20260816-0329 | Inactive | 2026-08-17 | USMCA |
| CODEX | FLEET TEST 20260821 | Probation | null | USMCA |
| CODEX | TEST Go0034 | Probation | null | USMCA |
| CODEX TEST | 0034 Driver | Probation | null | USMCA |
| SAMPLE | Cascade-1612 | Inactive | 2026-08-17 | USMCA |
| SAMPLE | Cascade-2042 | Inactive | 2026-08-17 | USMCA |
| TEST | CODEX 18756 | Probation | null | USMCA |
| TEST | CODEX ONBOARD 20260824 | Active | null | USMCA |
| TEST | DRIVER-USMCA | Inactive | 2026-08-17 | USMCA |
| TEST | Driver-One-20260806 | Inactive | 2026-08-17 | USMCA |
| TEST | DriverTESTMTDP79YF | Active | null | USMCA |
| TEST | FailedTESTMTDP79YF | Terminated | null | USMCA |
| TEST CODEX | GO0034 | Probation | null | USMCA |
| TEST-DRIVER-1 | SEED | Active | null | TRANSP |
| TEST-DRIVER-2 | SEED | Active | null | TRANSP |
| TEST-DRIVER-3 | SEED | Active | null | TRANSP |
| TEST-DRIVER-4 | SEED | Active | null | TRANSP |
| TESTCC3 | Driver0822 | Probation | null | USMCA |

**15 active/probation/terminated (not deactivated), 5 already inactive.**

### mdata.customers: 20 test-named customers

| Customer Name | Deactivated | Entity |
|---|---|---|
| CC2-BOOKLOAD-INLINE-TEST | 2026-08-17 | USMCA |
| CC3 TEST Customer 20260822-1054 | null | USMCA |
| CODEX-AUDIT-SPINE-20260816-0320 | 2026-08-17 | USMCA |
| Cascade-void-test-20260826 | 2026-08-27 | USMCA |
| GUARD-TEST-customers-name-TRANSP | null | TRANSP |
| GUARD-TEST-customers-name-USMCA | 2026-08-17 | USMCA |
| SAMPLE Customer Cascade-2046 | 2026-08-17 | USMCA |
| TEST-BREAKDOWN-RELAY-20260824-vp1oyj LLC | null | USMCA |
| TEST-CASCADE-CUSTOMER-20260824-1iklx7 | null | USMCA |
| TEST-CASCADE-CUSTOMER-20260824-vp1oyj | null | USMCA |
| TEST-CC3 Customer 0822 | null | USMCA |
| TEST-CUSTOMER-1 | 2026-05-25 | TRANSP |
| TEST-CUSTOMER-2 | 2026-05-25 | TRANSP |
| TEST-CUSTOMER-3 | 2026-05-25 | TRANSP |
| TEST-CUSTOMER-4 | 2026-05-25 | TRANSP |
| TEST-Customer-One-20260806 | 2026-08-17 | USMCA |
| USMCA-CODEX-CREATE-20260810-0117 | 2026-08-17 | USMCA |
| USMCA-CODEX-SUBCUSTOMER-20260810-0126 | 2026-08-17 | USMCA |
| ZZ-SAMPLE Customer A USMCA_GATEB_SAMPLE_2026-08-07 | null | USMCA |
| ZZ-SAMPLE Customer B USMCA_GATEB_SAMPLE_2026-08-07 | null | USMCA |

**11 active (not deactivated), 9 already deactivated.**

### mdata.vendors: 47 test-named vendors

Notable active test-named vendors on USMCA:
- TEST CODEX ONBOARD 20260824, TEST CODEX 18756, TEST CODEX GO0034 (paired with the driver accounts)
- CODEX ACTIVE FLEET TEST 20260821, CODEX FLEET TEST 20260821, CODEX TEST 0034 Driver, CODEX TEST Go0034
- CC3TEST Verify20260822, TESTCC3 Driver0822
- DEVIN-ASSET-DEFAULT-TEST, DEVIN-ASSET-DEFAULT-TEST-2, DEVIN-EXPENSE-ACCT-TEST, DEVIN-FULL-ROUNDTRIP-TEST, DEVIN-GO1615-EDGE-TEST, DEVIN-GO1615-EDGE-TEST2, DEVIN-LIFECYCLE-TEST, DEVIN-SAMPLE-TEST-1dbd082, DEVIN-TEST-VENDOR-GO0030
- CURSOR U6 TEST-DATA 20260823
- TEST Claude Collision Repair Body Shop, TEST DATA VOID-AT-LAUNCH CC3 Insurer Picker 20260822
- TEST DriverTESTMTDP79YF, TEST-VOID-LATER Vendor 0822
- ZZ-SAMPLE Vendor A USMCA_GATEB_SAMPLE_2026-08-07

Also on TRANSP: TEST-DRIVER-1/2/3/4 SEED, TEST-VENDOR-1/2/3/4

**Most are active (not deactivated). This is the widest contamination surface.**

### mdata.units: 23 test-named units

All test-named units are on the asset-holder entity (b49a737b...). Most are already deactivated (2026-08-31 or 2026-06-16). Notable:
- 4 TEST-TRUCK units still InService but deactivated 2026-06-16
- 6 U-DEMO units (Sold, deactivated 2026-06-16)
- USMCA-001 (OutOfService, deactivated 2026-08-31)
- TEST-CODEX-956214 on USMCA operating company (deactivated 2026-08-31)

---

## F1 — is_sample_data PROPAGATION

### Tables carrying is_sample_data (14 total)

All 14 tables have `is_sample_data` as NOT NULL DEFAULT false. Zero NULLs across all tables.

#### All-entity counts (true / false)

| Table | is_sample_data=true | is_sample_data=false | Total |
|---|---|---|---|
| accounting.bills | 54 | 16,273 | 16,327 |
| accounting.bill_payments | 16 | 6,551 | 6,567 |
| accounting.expenses | 151 | 27,151 | 27,302 |
| accounting.invoices | 39 | 12,065 | 12,104 |
| accounting.journal_entries | 460 | 2,123 | 2,583 |
| accounting.payments | 6 | 12,133 | 12,139 |
| driver_finance.driver_settlements | 28 | 19 | 47 |
| driver_finance.settlement_lines | 3 | 65 | 68 |
| mdata.customers | 17 | 3,938 | 3,955 |
| mdata.drivers | 15 | 256 | 271 |
| mdata.equipment | 3 | 296 | 299 |
| mdata.loads | 43 | 40 | 83 |
| mdata.units | 11 | 185 | 196 |
| mdata.vendors | 39 | 3,422 | 3,461 |

#### USMCA-only counts (operating_company_id = 5c854333...)

| Table | is_sample_data=true | is_sample_data=false | Total |
|---|---|---|---|
| accounting.bills | 54 | 26 | 80 |
| accounting.bill_payments | 16 | 7 | 23 |
| accounting.expenses | 151 | 81 | 232 |
| accounting.invoices | 39 | 85 | 124 |
| accounting.journal_entries | 460 | 338 | 798 |
| accounting.payments | 6 | 9 | 15 |
| driver_finance.driver_settlements | 28 | 19 | 47 |
| driver_finance.settlement_lines | 3 | 65 | 68 |

**Key finding:** USMCA has MORE sample-tagged than real records in bills (54/26), bill_payments (16/7), expenses (151/81), journal_entries (460/338), and driver_settlements (28/19). The sample data outweighs the real data on USMCA — the opposite of what a production entity should look like.

The register cited "17 unflagged expenses, 34 of 49 invoices" — those numbers likely counted only a subset (e.g., test-named-but-unflagged records). The full USMCA scope shows 81 unflagged expenses and 85 unflagged invoices. The register's F1 baseline understates the surface.

### Create-path analysis (file:line citations)

#### Paths that SET is_sample_data explicitly

| File | Line | Behavior |
|---|---|---|
| apps/backend/src/accounting/expenses.routes.ts | 117, 733-734 | `z.boolean().optional()` → sets `body.is_sample_data === true` |
| apps/backend/src/accounting/bills.routes.ts | 104 | `z.boolean().optional()` → passes to bills.service as `isSampleData` |
| apps/backend/src/accounting/bills.service.ts | 2087-2108 | Has explicit UPDATE path that sets `is_sample_data = true` for test bills |
| apps/backend/src/accounting/invoices.routes.ts | 536, 558 | Derives from `customer.is_sample_data` (Boolean(customer.is_sample_data)) |
| apps/backend/src/accounting/payments.routes.ts | 57, 423, 439 | `z.boolean().optional()` → sets `body.data.is_sample_data === true` |
| apps/backend/src/driver-finance/settlements.routes.ts | 55, 653, 668 | `z.boolean().default(false)` → sets `body.is_sample_data` |
| apps/backend/src/driver-finance/settlement-engine.ts | 106-108, 228-285 | Propagates from settlement to settlement_lines |
| apps/backend/src/driver-finance/settlements-load-bookended.service.ts | 62-66, 193-215 | Propagates from load to settlement (`opts.isSampleData ?? load.is_sample_data ?? false`) |
| apps/backend/src/banking/bulk-transactions.ts | 261, 319 | Sets is_sample_data on bill/bill_payment creation |
| apps/backend/src/banking/bank-transaction-splits.service.ts | 835, 883 | Sets is_sample_data on bill/bill_payment creation |
| apps/backend/src/accounting/bills-bulk.routes.ts | 208, 214 | Derives from parent bill: `COALESCE((SELECT b.is_sample_data FROM accounting.bills...), false)` |
| apps/backend/src/accounting/bank-recon/match.service.ts | 742, 769 | Sets is_sample_data on bill/bill_payment from bank match |
| apps/backend/src/mdata/loads.routes.ts | 158, 419, 426, 442 | `z.coerce.boolean().default(false)` → sets `b.is_sample_data ?? false` |
| apps/backend/src/mdata/drivers.routes.ts | 283, 858, 919 | `z.boolean().optional().default(false)` → sets `b.is_sample_data ?? false` |
| apps/backend/src/mdata/customers.routes.ts | 142, 771-772 | `z.boolean().optional()` → sets `b.is_sample_data ?? (looksLikeSampleDataName(...) || undefined)` |
| apps/backend/src/mdata/vendors.routes.ts | 119, 575 | `z.boolean().optional()` → sets `b.is_sample_data ?? (looksLikeSampleDataName(...) || undefined)` |

#### Paths that DERIVE is_sample_data

| File | Line | Behavior |
|---|---|---|
| apps/backend/src/accounting/posting-engine.service.ts | 697-732 | `readSourceIsSampleData()` — derives JE is_sample_data from source document (invoice/bill/expense/bill_payment/customer_payment). Maps 5 source types. Returns false for unmapped types. |
| apps/backend/src/accounting/void.service.ts | 263-276 | Reads is_sample_data from source document for void reversal JEs |
| apps/backend/src/driver-finance/settlement-disputes-p6.service.ts | 497-499 | Derives from settlement |
| apps/backend/src/driver-finance/settlement-dispute.service.ts | 580-582 | Derives from settlement |

#### Tables with NO writer (is_sample_data column exists but no create path sets it)

| Table | Note |
|---|---|
| mdata.equipment | NO route writes is_sample_data. The 3 true rows were likely set via direct SQL or a now-removed path. |
| mdata.units | NO route writes is_sample_data on create. The units.routes.ts only READS it for filtering (line 261). The 11 true rows were likely set via direct SQL or seed script. |

#### Key F1 finding for CC-2

1. **mdata.equipment and mdata.units have is_sample_data but NO create-path writer.** Any new equipment or unit created via the API will always get `is_sample_data=false` (the column default). This is a gap — if a test unit is created via the API, it cannot be tagged as sample through the normal path.

2. **The `looksLikeSampleDataName()` heuristic** in customers.routes.ts and vendors.routes.ts is the only automatic detection. It is name-based and will miss test data with non-obvious names (e.g., "DEVIN-ASSET-DEFAULT-TEST" might not match the heuristic's pattern).

3. **invoices.routes.ts derives is_sample_data from the customer** — if the customer is unflagged (is_sample_data=false), the invoice will also be unflagged, even if it's test data. This is the root cause of the "34 of 49 invoices" finding: test customers that were never tagged produce unflagged invoices.

4. **The register's F1 baseline understates the surface.** The register cited 17 unflagged expenses and 34 of 49 invoices. The full USMCA scope shows 81 unflagged expenses and 85 unflagged invoices (is_sample_data=false on USMCA). The gap is wider than reported.

---

## Remediation guidance for CC-2

### F2 check design

1. **Pattern:** Scan `catalogs.accounts`, `mdata.drivers`, `mdata.customers`, `mdata.vendors`, `mdata.units` for test-named records.
2. **Patterns to match:** `TEST`, `DEMO`, `SEED`, `SAMPLE`, `FAKE`, `CODEX %TEST%`, `CC3TEST`, `ARCHIVED-TEST`, `ZZ-SAMPLE`.
3. **Exclude:** Legitimate business names containing "test" (e.g., "Drug Test Services", "Emissions Test").
4. **Per entity:** Run for each operating_company_id separately.
5. **Shadow first:** Baseline = 24 accounts + 20 drivers + 20 customers + 47 vendors + 23 units = **134 test-named master data records**. Flip to blocking at zero.
6. **GL balance check:** Any test-named account with nonzero GL balance is a BLOCKING finding — cannot deactivate until reversed.
7. **Remediation:** Owner rules on disposition. Deactivate (never delete, per Rule 07). Reverse the $1,200 GL balance on DRIVERCASHAD896665-023 first.

### F1 check design

1. **Pattern:** For each financial table, count `is_sample_data = false` records that are test-named (using the same name patterns as F2).
2. **Per entity:** Run for each operating_company_id.
3. **Shadow first:** Baseline = count of unflagged test-named records per table. Flip to blocking at zero.
4. **Create-path gap:** Flag mdata.equipment and mdata.units as having no create-path writer for is_sample_data.
5. **Remediation:** Tag the unflagged test-named records with is_sample_data=true via a one-time backfill (owner-approved). Add is_sample_data to the equipment and units create paths.

---

## Evidence

- Neon queries: project tiny-field-89581227, bypass_rls=lucia, 2026-09-01
- All counts verified live against production Neon
- Create-path citations from grep of apps/backend/src on origin/main at 927825a
- No records were deleted, modified, or deactivated. This is a read-only sweep.

## Remaining work

- Owner rules on disposition of 134 test-named master data records
- Owner rules on reversing the $1,200 GL balance on DRIVERCASHAD896665-023
- CC-2 builds the F1 and F2 health checks from this data
- CC-2 wires them into /api/v1/healthz as critical-tier (Cursor wires the endpoint)
- The `looksLikeSampleDataName()` heuristic needs review — it may be missing test names
- mdata.equipment and mdata.units need is_sample_data added to their create paths (CC-1 migration)
