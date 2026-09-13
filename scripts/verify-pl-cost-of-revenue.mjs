#!/usr/bin/env node
// ROUND 20.9 ITEM 1 (Claude Lead, 2026-09-12 18:20 CT/23:20Z): the Accounting home P&L showed
// Revenue $218,074.91 / Gross profit $188,412.13 (86.4%) / Net income $184,219.69 (84.5% net
// margin) -- impossible for a trucking carrier (8-15% is a good year).
//
// TWO real, distinct defects, found in sequence, both guarded here:
//
// DEFECT 1 (POSTING, code, FIXED): apps/backend/src/insurance/policy.routes.ts's
// POST /api/v1/insurance/policies (create) never called createPolicyBillSchedule -- only
// POST .../renew did. Every brand-new (non-renewal) policy silently got no bill schedule and
// could never post a premium expense. Confirmed live: 3 real active USMCA policies (Cimarron,
// 2x Lloyds -- $271,280.41/yr combined) had ZERO postings, ever, to their role-bound account
// (5600 Truck Insurance). Fixed in PR #21940; the ORIGINAL half of this guard (detectNeverPosted
// CostRoles) locks it.
//
// DEFECT 2 (MATCHING-PRINCIPLE, structural, NOT fixed by this guard alone -- see ROUND 20.9's
// revised diagnosis, 2026-09-13 00:25 CT/2026-09-13 05:25Z-ish): the ORIGINAL version of this
// guard would have PASSED on the ledger that produced the 84.5% margin, because every checked
// cost role HAD posted at some point, ever. The real defect was a DATE mismatch: all 73 line-haul
// revenue postings fell in a 6-day band (2026-09-06 -> 09-11) while their real costs (fuel, driver
// pay) span back to 2026-07-21 -- any period filter bracketing the revenue captures almost none of
// the matching cost. Root cause: apps/backend/src/dispatch/delivery-evidence-latch.ts:82
// (`entryDateIso = input.entryDateIso ?? companyBusinessDate()`) -- every one of its 5 call sites
// omits entryDateIso, so revenue always posts dated to WHEN THE STATUS-TRANSITION API CALL RUNS,
// never the load's real delivery/invoice date. A batch-triggered transition compresses weeks of
// real revenue history into whatever narrow window the batch happened to run in, while costs
// (fuel cards, driver settlements) keep their own real dates. This guard's new
// detectDateRangeMismatch closes that gap: even when every cost role has SOME all-time postings,
// it fails if a cost role's own date range does not OVERLAP the revenue date range at all --
// the exact shape "posted, but never at the same time as the revenue it should offset" that
// zero-posting-count alone cannot catch.
//
// This guard: for each carrier cost-of-revenue ROLE this repo defines in
// accounting.chart_of_accounts_roles (driver_pay_expense, company_fuel_advance_expense,
// toll_scale_expense, insurance_expense), when the company has ANY posted revenue (revenue_default
// role account) ever:
//   (1) that role's bound account must have carried at least ONE posting, ever (DEFECT 1's class).
//   (2) that role's own [min,max] posting-date range must OVERLAP the revenue postings' own
//       [min,max] date range (DEFECT 2's class) -- non-overlapping means a genuine matching-
//       principle break, regardless of what window a P&L report later selects.
// RATCHET-free (a hard gate on both), because a role that legitimately never applies to a given
// entity (e.g. no lease at all) is scoped out of CHECKED_ROLES, not baselined. Maintenance
// (maintenance_parts_expense / heavy_repair_expense) is intentionally left OUT: unlike insurance
// (a signed policy obligates a premium whether or not a claim happens), maintenance cost is
// event-driven -- zero completed work orders can be a genuine, non-defective fact (confirmed live
// for USMCA: 17 work orders, all status='cancelled', zero completed). Lease is also left out: no
// leasing-cost data source exists to check against.
//
// LIVE-DATA CHECK: requires DATABASE_URL pointed at a read-only prod role (same convention as
// verify-load-settlement-linkage.mjs). SKIPs (not fails) without one.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pl-cost-of-revenue";
const USMCA_OPCO_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Role -> human label. Each of these MUST have posted at least once, AND its date range must
// overlap revenue's, if the company has ever posted revenue at all. See the file header for why
// maintenance/lease are intentionally excluded.
export const CHECKED_ROLES = {
  driver_pay_expense: "driver pay / cost of labor",
  company_fuel_advance_expense: "fuel",
  toll_scale_expense: "tolls & scales",
  insurance_expense: "insurance",
};

/**
 * Pure: given whether the company has EVER posted revenue, and each checked role's all-time
 * posting count, which roles are missing entirely? (DEFECT 1's class.)
 * @param {boolean} hasEverPostedRevenue
 * @param {{role: string, accountNumber: string, accountName: string, allTimePostingCount: number}[]} roleBalances
 */
export function detectNeverPostedCostRoles(hasEverPostedRevenue, roleBalances) {
  if (!hasEverPostedRevenue) return [];
  return roleBalances.filter((r) => Object.hasOwn(CHECKED_ROLES, r.role) && r.allTimePostingCount === 0);
}

/**
 * Pure: given the revenue postings' own [min,max] date range and each checked cost role's own
 * [min,max] date range (only for roles that HAVE posted -- a zero-posting role is DEFECT 1's
 * class, not this one), which roles' date ranges do not overlap revenue's at all? (DEFECT 2's
 * class -- "posted, but never in the same window as the revenue it should offset".)
 * Dates are plain 'YYYY-MM-DD' strings (or null for a role with no postings, which this function
 * skips -- detectNeverPostedCostRoles already covers that case).
 * @param {{minDate: string, maxDate: string} | null} revenueRange
 * @param {{role: string, accountNumber: string, accountName: string, minDate: string|null, maxDate: string|null}[]} roleRanges
 */
export function detectDateRangeMismatch(revenueRange, roleRanges) {
  if (!revenueRange) return [];
  return roleRanges.filter((r) => {
    if (!Object.hasOwn(CHECKED_ROLES, r.role)) return false;
    if (r.minDate === null || r.maxDate === null) return false; // DEFECT 1's class, not this one
    // Overlap iff NOT (cost ends before revenue starts OR cost starts after revenue ends).
    const noOverlap = r.maxDate < revenueRange.minDate || r.minDate > revenueRange.maxDate;
    return noOverlap;
  });
}

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const revenueRes = await client.query(
      `SELECT count(*) AS n, min(je.entry_date)::text AS min_date, max(je.entry_date)::text AS max_date
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id
        WHERE p.operating_company_id = $1 AND r.role = 'revenue_default' AND r.is_active = true
          AND p.debit_or_credit = 'credit' AND je.status <> 'void' AND je.voided_at IS NULL`,
      [USMCA_OPCO_ID]
    );
    const hasEverPostedRevenue = Number(revenueRes.rows[0].n) > 0;
    const revenueRange = hasEverPostedRevenue
      ? { minDate: revenueRes.rows[0].min_date, maxDate: revenueRes.rows[0].max_date }
      : null;

    const roleRoles = Object.keys(CHECKED_ROLES);
    const roleRes = await client.query(
      `SELECT r.role, a.account_number, a.account_name,
              (SELECT count(*) FROM accounting.journal_entry_postings p
                WHERE p.account_id = a.id AND p.operating_company_id = $1) AS all_time_posting_count,
              (SELECT min(je.entry_date)::text FROM accounting.journal_entry_postings p
                JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                WHERE p.account_id = a.id AND p.operating_company_id = $1
                  AND je.status <> 'void' AND je.voided_at IS NULL) AS min_date,
              (SELECT max(je.entry_date)::text FROM accounting.journal_entry_postings p
                JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                WHERE p.account_id = a.id AND p.operating_company_id = $1
                  AND je.status <> 'void' AND je.voided_at IS NULL) AS max_date
         FROM accounting.chart_of_accounts_roles r
         JOIN catalogs.accounts a ON a.id = r.account_id
        WHERE r.operating_company_id = $1 AND r.is_active = true AND r.role = ANY($2::text[])`,
      [USMCA_OPCO_ID, roleRoles]
    );
    const roleBalances = roleRes.rows.map((row) => ({
      role: row.role,
      accountNumber: row.account_number,
      accountName: row.account_name,
      allTimePostingCount: Number(row.all_time_posting_count),
      minDate: row.min_date,
      maxDate: row.max_date,
    }));

    return {
      hasEverPostedRevenue,
      neverPosted: detectNeverPostedCostRoles(hasEverPostedRevenue, roleBalances),
      dateMismatch: detectDateRangeMismatch(revenueRange, roleBalances),
    };
  } finally {
    await client.end();
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`${LABEL} SKIP — no DATABASE_URL (this is a live-prod-only audit, read-only role required)`);
    return;
  }
  const { hasEverPostedRevenue, neverPosted, dateMismatch } = await auditLive(databaseUrl);
  if (!hasEverPostedRevenue) {
    console.log(`${LABEL} PASS — no posted revenue yet, no cost-of-revenue expectation to check`);
    return;
  }
  let failed = false;
  if (neverPosted.length > 0) {
    failed = true;
    console.error(`${LABEL} FAIL — revenue has posted, but ${neverPosted.length} carrier cost-of-revenue role(s) have NEVER posted:`);
    for (const m of neverPosted) console.error(`  ✗ ${m.role} (${CHECKED_ROLES[m.role]}) -> account ${m.accountNumber} ${m.accountName}`);
  }
  if (dateMismatch.length > 0) {
    failed = true;
    console.error(`${LABEL} FAIL — ${dateMismatch.length} cost-of-revenue role(s) have posted, but their date range never overlaps revenue's:`);
    for (const m of dateMismatch) console.error(`  ✗ ${m.role} (${CHECKED_ROLES[m.role]}) -> account ${m.accountNumber} ${m.accountName}, posted ${m.minDate}..${m.maxDate}`);
  }
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL} PASS — revenue has posted, every checked cost-of-revenue role has posted at least once, and every role's date range overlaps revenue's`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const balances = [
    { role: "driver_pay_expense", accountNumber: "6890", accountName: "Cost of Labor", allTimePostingCount: 42, minDate: "2026-08-10", maxDate: "2026-09-11" },
    { role: "company_fuel_advance_expense", accountNumber: "5000", accountName: "Fuel & Diesel", allTimePostingCount: 19, minDate: "2026-07-21", maxDate: "2026-09-11" },
    { role: "toll_scale_expense", accountNumber: "5300", accountName: "Tolls & Scales", allTimePostingCount: 1, minDate: "2026-09-06", maxDate: "2026-09-06" },
    { role: "insurance_expense", accountNumber: "5600", accountName: "Truck Insurance", allTimePostingCount: 0, minDate: null, maxDate: null },
  ];

  // ---- DEFECT 1 class: never-posted-at-all ----
  const missing = detectNeverPostedCostRoles(true, balances);
  assert.ok(missing.length === 1 && missing[0].role === "insurance_expense", `expected exactly insurance_expense flagged, got: ${JSON.stringify(missing)}`);
  const allZero = balances.map((b) => ({ ...b, allTimePostingCount: 0 }));
  assert.ok(detectNeverPostedCostRoles(false, allZero).length === 0, "no revenue posted yet means nothing is flagged");
  const allNonZero = balances.map((b) => ({ ...b, allTimePostingCount: Math.max(1, b.allTimePostingCount) }));
  assert.ok(detectNeverPostedCostRoles(true, allNonZero).length === 0, "every role posted at least once means nothing is flagged");
  const withUncheckedRole = [...balances, { role: "rent_expense", accountNumber: "QBO-228", accountName: "Lease", allTimePostingCount: 0 }];
  assert.ok(!detectNeverPostedCostRoles(true, withUncheckedRole).some((m) => m.role === "rent_expense"), "an unchecked role (e.g. lease) must never be flagged");

  // ---- DEFECT 2 class: posted, but date ranges never overlap revenue's ----
  // This is the exact live shape ROUND 20.9 actually measured: revenue only 09-06..09-11, but
  // that DOES overlap driver-pay/fuel's ranges above (both include 09-06..09-11) -- so THIS
  // ORIGINAL guard spec would have PASSED it, exactly the lesson the Lead named. Prove that, then
  // prove the guard catches a role that has truly stopped overlapping.
  const revenueRange = { minDate: "2026-09-06", maxDate: "2026-09-11" };
  assert.ok(detectDateRangeMismatch(revenueRange, balances).length === 0, "the live 09-06..09-11 shape overlaps every posted role's range -- this guard alone does not fully explain an 84.5% margin, only catches a role that has genuinely stopped overlapping");

  // A role whose entire posting history predates revenue's earliest date entirely (e.g. cost
  // stopped being posted well before revenue started, or the reverse) must be flagged.
  const staleCostRole = [{ role: "toll_scale_expense", accountNumber: "5300", accountName: "Tolls & Scales", allTimePostingCount: 5, minDate: "2026-01-01", maxDate: "2026-03-01" }];
  const mismatch = detectDateRangeMismatch(revenueRange, staleCostRole);
  assert.ok(mismatch.length === 1 && mismatch[0].role === "toll_scale_expense", `expected toll_scale_expense flagged for a non-overlapping range, got: ${JSON.stringify(mismatch)}`);

  // A role with no revenue posted at all -> nothing to compare, nothing flagged.
  assert.ok(detectDateRangeMismatch(null, staleCostRole).length === 0, "no revenue range means nothing to compare");

  // A role that has never posted (minDate/maxDate null) is DEFECT 1's class, not this one -- must
  // never be flagged here even though it trivially "does not overlap".
  const neverPostedRole = [{ role: "insurance_expense", accountNumber: "5600", accountName: "Truck Insurance", allTimePostingCount: 0, minDate: null, maxDate: null }];
  assert.ok(detectDateRangeMismatch(revenueRange, neverPostedRole).length === 0, "a never-posted role is DEFECT 1's class, not flagged by the date-overlap check");

  // An unchecked role (e.g. lease) with a wildly non-overlapping range must never be flagged.
  const uncheckedMismatch = [{ role: "rent_expense", accountNumber: "QBO-228", accountName: "Lease", allTimePostingCount: 3, minDate: "2020-01-01", maxDate: "2020-06-01" }];
  assert.ok(detectDateRangeMismatch(revenueRange, uncheckedMismatch).length === 0, "an unchecked role must never be flagged by the date-overlap check either");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
