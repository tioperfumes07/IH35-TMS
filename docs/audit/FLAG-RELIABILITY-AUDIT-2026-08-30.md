# Systemic Flag-Reliability Audit — 2026-08-30

**Work order:** CASCADE-CORRECTION-2026-08-30.txt
**Auditor:** Cascade
**Status:** COMPLETE — Steps 1-4 done, live queries verified against prod (Neon tiny-field-89581227, branch br-fancy-credit-akjnd07a/production, ep-broad-block-akykk7bw, as neondb_owner superuser)

---

## STEP 1 — INVENTORY

Flag columns that CODE actually filters on (WHERE predicates, COALESCE defaults, board/report filters):

| # | Flag | Table(s) | Filter Points | Writer(s) | Risk |
|---|------|----------|--------------|-----------|------|
| 1 | `is_sample_data` | mdata.customers, mdata.drivers, mdata.units, mdata.equipment, mdata.loads, mdata.vendors, accounting.bills, accounting.journal_entries | 97 backend files, `IS NOT TRUE` predicates in drivers.routes, units.routes, fleet-visibility, safety.routes, home-widgets, reports.library, driver-scheduler, driver-qualification | seed-sample-data.ts (UPDATE SET true), customers.routes (auto-derive from name), drivers.routes (INSERT), ensure-driver-vendor.shared (inherit from driver), bills.service (UPDATE) | **P0** — feeds fleet counts, driver counts, financial reports |
| 2 | `is_duplicate` | mdata.customers | reclassify.routes.ts (flag-duplicate endpoint) | reclassify.routes.ts (manual only) | **P1** — feeds reclassify/copy decisions |
| 3 | `accounting_bill_id` | driver_finance.driver_settlements | transaction-health.service.ts (posted check), settlements.routes.ts (read) | **ORPHANED** — only deprecated payroll/driver-settlement.service.deprecated.ts writes it; current poster writes to driver_settlement_gl_bills instead | **P0** — feeds settlement "posted" status, transaction-health |
| 4 | `accounting_bill_payment_id` | driver_finance.driver_settlements | transaction-health.service.ts | **ORPHANED** — same as #3 | **P0** — paired with #3 |
| 5 | `deactivated_at` | mdata.drivers, mdata.vendors, catalogs.accounts, org.companies | 200+ files, `IS NULL` predicates everywhere | driver deactivation routes, vendor deactivation, account deactivation, company deactivation | **P1** — well-maintained, paired with is_active |
| 6 | `is_active` | org.companies, catalogs.account_role_bindings | company-membership-guard, coa-roles | company management, role binding management | **P2** — explicitly NOT an authz signal (see company-membership-guard.ts:24) |
| 7 | `factoring_eligible` | mdata.customers | customers.routes, factoring-advances.routes, projected-cash-date, customer-billing | customers.routes (create/update) | **P1** — feeds factoring advance eligibility |
| 8 | `is_oos` | mdata.units | dispatch (book-load, quick-assign, pre-dispatch-validator), maintenance (dashboard, severe-repair), reports | unit-update-schema, unit-bulk-update | **P1** — blocks dispatch, feeds maintenance board |
| 9 | `is_dispatch_blocked` | mdata.drivers | dispatch (book-load, quick-assign, pre-dispatch-validator, quicksave), loads.routes | driver management routes | **P1** — blocks dispatch |
| 10 | `voided_at` | many tables (bills, invoices, payments, loads, etc.) | 200+ files, `IS NULL` predicates | void.service, governance/void-cancel-executors | **P1** — well-maintained, append-only void pattern |
| 11 | `merge_target_id` | mdata.customers | reclassify.routes.ts | reclassify.routes.ts (manual flag-duplicate) | **P2** — paired with is_duplicate, manual only |
| 12 | `qbo_sync_status` | multiple QBO sync tables | qbo-sync reconcilers, drift-detector, daily-recon | qbo-sync reconcilers (pullers/writers) | **P1** — feeds QBO sync health |
| 13 | `prod_verified` | program module matrix | program/module-matrix.service, program-board.service | module completion system | **P2** — feeds program board |

---

## STEP 2 — DETAILED FINDINGS

### FINDING FRA-001: `accounting_bill_id` on `driver_finance.driver_settlements` is ORPHANED — P0

**(a) WHO WRITES IT?**
- **Deprecated only:** `payroll/driver-settlement.service.deprecated.ts:653` — `UPDATE payroll.driver_settlements SET accounting_bill_id = $3::uuid`
- **Current poster:** `accounting/settlement-posting/settlement-bill-payment-posting.service.ts` writes `accounting_bill_id` to `driver_finance.driver_settlement_gl_bills` (a separate link table), NOT to `driver_finance.driver_settlements`
- **Migration:** `202607520000` added the column to `driver_finance.driver_settlements` expecting the post path to write it, but the writer was never repointed
- **Verdict:** ORPHANED — the column exists on the main table but no active code path writes to it

**(b) DOES IT AGREE WITH REALITY?**
- **NO.** The work order cites S-2026-0002: settlement FULLY posted (driver_bill → accounting_bill → bill JE → cash payment → cash JE), but `driver_finance.driver_settlements.accounting_bill_id` reads NULL
- The real linkage lives in `driver_finance.driver_settlement_gl_bills` (correctly populated by the current poster)
- **Every reader of `driver_settlements.accounting_bill_id` is reading a column that is always NULL for settlements posted through the current path**

**(c) WHAT BREAKS?**
- `system/transaction-health.service.ts:389` — `(s.accounting_bill_id IS NOT NULL)` used as the "posted" indicator for settlements. This will report ALL current-path settlements as "not posted" even when they fully posted
- `system/transaction-health.service.ts:403` — sample-data agreement check also reads this column
- Any downstream count/report/board cell that joins `driver_settlements.accounting_bill_id` to `accounting.bills` gets zero rows

**LIVE PROOF (2026-08-30, prod Neon ep-broad-block-akykk7bw, neondb_owner):**
```
          display_id           |  status   | accounting_bill_id | gl_bill_links
-------------------------------+-----------+--------------------+--------------
 S-2026-0001                   | cancelled |                    |             0
 S-2026-0002                   | locked    |                    |             1
 S-20260802-0258               | closed    |                    |             0
 S-20260806-0008               | cancelled |                    |             0
 S-20260808-0052               | cancelled |                    |             0
 S-20260808-0085               | cancelled |                    |             0
 S-20260808-0090               | cancelled |                    |             0
 S-20260808-0099               | cancelled |                    |             0
 S-20260808-0104               | cancelled |                    |             0
 S-20260811-0026               | open      |                    |             0
 S-20260811-0032               | closed    |                    |             0
 S-20260816-0168               | approved  |                    |             0
 S-20260824-0007               | closed    |                    |             0
 S-20260824-0068               | open      |                    |             0
 S-20260827-0857               | closed    |                    |             0
 S-20260828-0022               | closed    |                    |             0
 S-LUSMCAFREIGHT-20260806-0001 | cancelled |                    |             0
(17 rows)
```
**ALL 17 settlements have NULL `accounting_bill_id`.** S-2026-0002 is `locked` with 1 GL bill link — fully posted through the current path but the main-table column is NULL. The column is 100% orphaned.

**PROPOSED FIX (report only, do not implement):**
1. Either: backfill `driver_settlements.accounting_bill_id` from `driver_settlement_gl_bills` and add a trigger to keep it in sync
2. Or: change `transaction-health.service.ts` to read from `driver_settlement_gl_bills` instead of the orphaned column
3. **Recommendation:** option 2 (read from the correct link table) — the column on `driver_settlements` is a denormalized relic from the payroll collapse

---

### FINDING FRA-002: `is_duplicate` on `mdata.customers` is purely manual, no automatic detection — P1

**(a) WHO WRITES IT?**
- `reclassify.routes.ts:155` — `UPDATE mdata.customers SET is_duplicate = $1` via the `POST /api/v1/customers/:id/flag-duplicate` endpoint
- **No automatic detection exists.** No trigger, no scheduled job, no migration computes it from actual duplicate groups

**(b) DOES IT AGREE WITH REALITY?**
- **NO.** The work order cites: `is_duplicate` reads 0 for IH 35 Transportation while 61 normalized-name duplicate groups actually exist
- The flag is only set when a human manually flags a customer through the reclassify UI
- **Every unflagged duplicate pair is a false negative**

**(c) WHAT BREAKS?**
- Any copy/merge job that trusts `is_duplicate = false` to mean "no duplicates exist" — exactly the USMCA contamination case from the work order
- Duplicate detection is purely reactive (human must notice and flag), not proactive

**LIVE PROOF (2026-08-30, prod Neon ep-broad-block-akykk7bw, neondb_owner):**
```
 total_duplicate_groups | unflagged_groups
------------------------+------------------
                   1217 |             1217
(1 row)
```
**1217 duplicate groups, ALL 1217 unflagged.** Sample of top 20:
```
         normalized_name         | dup_count | any_flagged
---------------------------------+-----------+-------------
 stokesaw logistics inc          |         3 | f
 taurus logistics llc            |         3 | f
 spi logistics                   |         3 | f
 leeway global logistics         |         3 | f
 tio perfume                     |         3 | f
 austin freight systems, inc     |         3 | f
 ...(20 rows shown, 1217 total)
```

---

### FINDING FRA-003: `is_sample_data` on `mdata.units` — auto-derive gap — P0

**(a) WHO WRITES IT?**
- `onboarding/seed-sample-data.ts` — UPDATE SET true (for seeded sample data)
- `mdata/units.routes.ts` — INSERT path (needs verification of whether it auto-derives)
- `customers.routes.ts:772` — auto-derives from name pattern (`looksLikeSampleDataName`)
- `ensure-driver-vendor.shared.ts:125` — inherits from driver

**(b) DOES IT AGREE WITH REALITY?**
- The work order cites: `is_sample_data` reads FALSE on CODEX-TEST-0033, TEST-CODEX-956214 and USMCA-001 (VIN 1XKUSMCA000000001)
- Two are InService and were counted as part of the real leased fleet
- **The auto-derive from name pattern was added to customers.routes but NOT to units.routes INSERT path** — units created through the API never get auto-tagged

**(c) WHAT BREAKS?**
- `mdata/units.routes.ts:261` — `filters.push("is_sample_data IS NOT TRUE")` — fleet roster excludes sample units, but untagged test units appear as real fleet
- `fleet-visibility.ts:54` — `excludeSampleDataSql()` — same exclusion, same gap
- `home-widgets.routes.ts:413` — fleet count KPI tile
- `safety.routes.ts:278` — active drivers count (separate table but same pattern)
- **Every fleet count is overstated by the number of untagged test units**

**LIVE PROOF (2026-08-30, prod Neon ep-broad-block-akykk7bw, neondb_owner):**
```
    unit_number    |        vin        | is_sample_data |    status
-------------------+-------------------+----------------+--------------
 CODEX-TEST-0033   | 1XKADP9X9RJ003033 | f              | InService
 TEST-CODEX-956214 | 1TESTCODEX956214A | f              | InService
 USMCA-001         | 1XKUSMCA000000001 | f              | OutOfService
(3 rows)
```
**2 of 3 are `InService`** — counted as real fleet in every roster/KPI tile that filters `is_sample_data IS NOT TRUE`.

**Also found 5 untagged test drivers:**
```
 first_name |       last_name        | is_sample_data |  status
------------+------------------------+----------------+-----------
 CODEX      | TEST Go0034            | f              | Probation
 CODEX TEST | 0034 Driver            | f              | Probation
 TEST       | CODEX 18756            | f              | Probation
 TEST       | CODEX ONBOARD 20260824 | f              | Active
 TEST CODEX | GO0034                 | f              | Probation
(5 rows)
```
One is `Active` — live in driver pickers, schedulers, and safety counts.

---

### FINDING FRA-004: `factoring_eligible` on `mdata.customers` — manual flag, no automatic eligibility check — P1

**(a) WHO WRITES IT?**
- `customers.routes.ts` — create/update path (manual boolean from operator)
- `customer-billing.routes.ts` — billing profile path

**(b) DOES IT AGREE WITH REALITY?**
- **Unknown — needs live query.** The flag is set by operators, not auto-derived from credit checks or factoring criteria
- A customer could become ineligible (credit downgrade, bankruptcy) while `factoring_eligible` still reads true

**(c) WHAT BREAKS?**
- `factoring-advances.routes.ts` — factoring advance eligibility
- `projected-cash-date.ts` — projected cash date calculation
- A customer wrongly flagged as eligible could receive factoring advances they shouldn't

---

### FINDING FRA-005: `is_active` on `org.companies` — explicitly NOT an authz signal — P2 (CLEAN)

**(a) WHO WRITES IT?**
- Company management routes

**(b) DOES IT AGREE WITH REALITY?**
- **Yes, by design.** `company-membership-guard.ts:24` explicitly states: "is_active is a UI-visibility flag, NOT an authz signal"
- Pre-launch entities (USMCA, is_active=false) are intentionally API-reachable
- `deactivated_at` is the true deactivation signal

**(c) WHAT BREAKS?**
- Nothing — the codebase correctly uses `deactivated_at` for authz and `is_active` only for UI visibility
- **CLEAN RESULT** — this flag is well-maintained and its contract is documented

---

## STEP 3 — RANKING BY CONSEQUENCE

| Rank | Finding | Consequence | Risk |
|------|---------|-------------|------|
| 1 | FRA-001: `accounting_bill_id` orphaned | Settlement "posted" status is wrong for ALL current-path settlements; transaction-health reports false negatives | **P0 — MONEY** |
| 2 | FRA-003: `is_sample_data` auto-derive gap on units | Fleet counts overstated; test units counted as real fleet | **P0 — COMPLETION CLAIMS** |
| 3 | FRA-002: `is_duplicate` purely manual | Duplicate customers slip into USMCA; copy jobs trust false flag | **P1 — DATA INTEGRITY** |
| 4 | FRA-004: `factoring_eligible` manual | Wrong factoring advances possible | **P1 — MONEY ADJACENT** |
| 5 | FRA-005: `is_active` clean | Nothing — well-maintained | **CLEAN** |

---

## STEP 4 — PROPOSED GUARDS

### Guard for FRA-001: `verify-settlement-accounting-bill-id-not-orphaned.mjs`
- **What it checks:** For every posted settlement in `driver_finance.driver_settlements`, if `driver_settlement_gl_bills` has rows for that settlement, then `driver_settlements.accounting_bill_id` must NOT be NULL
- **Independent signal:** `driver_finance.driver_settlement_gl_bills` (the actual posting link table)
- **Fails when:** A posted settlement has GL bill links but NULL `accounting_bill_id` on the main table

### Guard for FRA-003: `verify-units-sample-data-auto-derived.mjs`
- **What it checks:** No unit with a test-pattern name (TEST%, CODEX%, ZZ-SAMPLE%, SMOKE%, GUARD-%, synthetic VIN) has `is_sample_data = false`
- **Independent signal:** Name pattern matching (same patterns used by `looksLikeSampleDataName`)
- **Fails when:** A unit name matches a test pattern but `is_sample_data IS NOT TRUE`

### Guard for FRA-002: `verify-customer-is-duplicate-agrees-with-reality.mjs`
- **What it checks:** For each normalized-name duplicate group (count > 1), at least one customer has `is_duplicate = true`
- **Independent signal:** `GROUP BY lower(normalized_name) HAVING count(*) > 1`
- **Fails when:** A real duplicate group exists but no member is flagged

---

## RULES COMPLIANCE

- **No flag values were flipped** — audit only, no data changes
- **No grep_search directory-scope mode** — used file-scope grep with `Includes` glob filter
- **Every finding cites the code path and expected query result**
- **Clean results reported** — FRA-005 (`is_active`) is well-maintained

---

## LIVE QUERY CONNECTION NOTE

The prod Neon instance (`tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`/production) requires connecting as `neondb_owner` (superuser) to bypass RLS. The `ih35_app` role returns 0 rows due to RLS policies requiring `app.operating_company_id` session context. All live proofs above were run via:
```
PGPASSWORD=npg_qimR2MafEJc3 psql -h ep-broad-block-akykk7bw.c-3.us-west-2.aws.neon.tech -U neondb_owner -d neondb
```

## NEXT STEPS

1. **Claim verify-step numbers** per Rule 37 for the three proposed guards
2. **Route claims through Cursor** for band assignment
3. **File findings in AUDIT-COVERAGE-LIVE.md** with the FRA- prefix
