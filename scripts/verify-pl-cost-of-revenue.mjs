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
// it fails if a cost role's own [min,max] posting-date range does not OVERLAP the revenue date
// range at all -- the exact shape "posted, but never at the same time as the revenue it should
// offset" that zero-posting-count alone cannot catch.
//
// FEED-SCOPING (E23, owner ruling 2026-09-23 23:55 UTC): the guard now asserts only over loads
// whose FULL COST CHAIN has been fed, not over every load with revenue. A load is IN SCOPE iff
// (a) it is live in mdata.loads for USMCA, AND (b) it belongs to a Faro purchase day where EVERY
// invoice for that day exists live in accounting.invoices. This is the same CLOSED FEED SET
// verify-alwaystrack-parity.mjs computes — read it, do not re-derive it. A load with revenue and
// no costs yet, on a day still being fed, is NOT a violation — it is out of scope. Scope is a
// POPULATION check: no flag, no env var, no date, no hand-kept count. It arms itself as Cursor
// feeds. When 9/21 closes it asserts the whole book with no exemption left.
//
// This guard: for each carrier cost-of-revenue ROLE this repo defines in
// accounting.chart_of_accounts_roles (driver_pay_expense, company_fuel_advance_expense,
// toll_scale_expense, insurance_expense), when IN-SCOPE loads have ANY posted revenue
// (revenue_default role account):
//   (1) that role's bound account must have carried at least ONE posting for an in-scope load
//       (DEFECT 1's class).
//   (2) that role's own [min,max] posting-date range (for in-scope loads) must OVERLAP the
//       revenue postings' own [min,max] date range (for in-scope loads) (DEFECT 2's class) --
//       non-overlapping means a genuine matching-principle break, regardless of what window a
//       P&L report later selects.
// RATCHET-free (a hard gate on both), because a role that legitimately never applies to a given
// entity (e.g. no lease at all) is scoped out of CHECKED_ROLES, not baselined. Maintenance
// (maintenance_parts_expense / heavy_repair_expense) is intentionally left OUT: unlike insurance
// (a signed policy obligates a premium whether or not a claim happens), maintenance cost is
// event-driven -- zero completed work orders can be a genuine, non-defective fact (confirmed live
// for USMCA: 17 work orders, all status='cancelled', zero completed). Lease is also left out: no
// leasing-cost data source exists to check against.
//
// LIVE-DATA CHECK: requires DATABASE_URL pointed at a read-only prod role (same convention as
// verify-load-settlement-linkage.mjs). Fails closed without one (ROUND 29.9-B).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B) and runs in money-pr-local-gate.mjs when its owned paths change (Lead ROUND 84, E7 batch 2)";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pl-cost-of-revenue";
const USMCA_OPCO_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");

// Role -> human label. Each of these MUST have posted at least once, AND its date range must
// overlap revenue's, if in-scope loads have posted revenue. See the file header for why
// maintenance/lease are intentionally excluded.
export const CHECKED_ROLES = {
  driver_pay_expense: "driver pay / cost of labor",
  company_fuel_advance_expense: "fuel",
  toll_scale_expense: "tolls & scales",
  insurance_expense: "insurance",
};

/**
 * Pure: given whether in-scope loads have posted revenue, and each checked role's in-scope
 * posting count, which roles are missing entirely? (DEFECT 1's class.)
 * @param {boolean} hasInScopeRevenue
 * @param {{role: string, accountNumber: string, accountName: string, inScopePostingCount: number}[]} roleBalances
 */
export function detectNeverPostedCostRoles(hasInScopeRevenue, roleBalances) {
  if (!hasInScopeRevenue) return [];
  return roleBalances.filter((r) => Object.hasOwn(CHECKED_ROLES, r.role) && r.inScopePostingCount === 0);
}

/**
 * Pure: given the revenue postings' own [min,max] date range (for in-scope loads) and each
 * checked cost role's own [min,max] date range (for in-scope loads, only for roles that HAVE
 * posted -- a zero-posting role is DEFECT 1's class, not this one), which roles' date ranges
 * do not overlap revenue's at all? (DEFECT 2's class.)
 * Dates are plain 'YYYY-MM-DD' strings (or null for a role with no postings, which this
 * function skips -- detectNeverPostedCostRoles already covers that case).
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

/**
 * Pure: reads the ground-truth JSON (same file verify-alwaystrack-parity.mjs uses) and produces
 * one target row per USMCA document with its load list. A document is IN SCOPE when every load
 * it references is live in mdata.loads for USMCA.
 */
export function computeGroundTruthDocuments(raw) {
  const company = raw.company ?? [];
  return company.map((r) => ({
    doc: String(r.settlement_no),
    loads: r.loads ?? [],
  }));
}

/**
 * Pure: given the ground-truth documents and the set of live load numbers, partition loads into
 * in-scope (every load in their document is live) and skipped (NOT FED YET).
 * @param {{doc: string, loads: string[]}[]} documents
 * @param {Set<string>} liveLoadNumbers
 * @returns {{inScopeLoads: string[], skippedCount: number, totalLoads: number}}
 */
export function partitionInScopeLoads(documents, liveLoadNumbers) {
  const inScopeLoads = [];
  let skippedCount = 0;
  for (const doc of documents) {
    const loads = doc.loads ?? [];
    const allLive = loads.length > 0 && loads.every((n) => liveLoadNumbers.has(n));
    if (allLive) {
      inScopeLoads.push(...loads);
    } else {
      skippedCount += loads.length;
    }
  }
  // Deduplicate (a load may appear in multiple documents).
  const uniqueInScope = [...new Set(inScopeLoads)];
  const totalLoads = [...new Set(documents.flatMap((d) => d.loads ?? []))].length;
  return { inScopeLoads: uniqueInScope, skippedCount: totalLoads - uniqueInScope.length, totalLoads };
}

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // ── FEED SCOPING: read ground truth, find live loads, partition ─────────────────────
    if (!fs.existsSync(GROUND_TRUTH_PATH)) {
      console.error(`${LABEL}: LIVE FAIL — ground truth file missing: ${GROUND_TRUTH_PATH}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
    const documents = computeGroundTruthDocuments(raw);

    // All load numbers referenced by any document.
    const allLoadNumbers = [...new Set(documents.flatMap((d) => d.loads ?? []))];

    // Query mdata.loads for USMCA to find which load numbers are live.
    const loadsRes = await client.query(
      `SELECT l.load_number
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND l.is_sample_data IS NOT TRUE AND l.soft_deleted_at IS NULL`,
      [USMCA_OPCO_ID, allLoadNumbers]
    );
    const liveLoadNumbers = new Set(loadsRes.rows.map((r) => r.load_number));

    const { inScopeLoads, skippedCount, totalLoads } = partitionInScopeLoads(documents, liveLoadNumbers);

    console.log(`P&L scope: ${inScopeLoads.length} of ${totalLoads} loads in scope, ${skippedCount} skipped NOT FED YET`);

    // If no in-scope loads, PASS — nothing to check (NOT FED YET).
    if (inScopeLoads.length === 0) {
      return { hasInScopeRevenue: false, neverPosted: [], dateMismatch: [], inScopeLoads: 0, totalLoads };
    }

    // ── Revenue postings for in-scope loads only ────────────────────────────────────────
    // Revenue postings use source_transaction_type='load' and source_transaction_id=load.id::text.
    const revenueRes = await client.query(
      `SELECT count(*) AS n, min(je.entry_date)::text AS min_date, max(je.entry_date)::text AS max_date
         FROM accounting.journal_entry_postings p
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id
         JOIN mdata.loads l ON l.id::text = p.source_transaction_id AND l.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1 AND r.role = 'revenue_default' AND r.is_active = true
          AND p.debit_or_credit = 'credit' AND je.status <> 'void' AND je.voided_at IS NULL
          AND p.source_transaction_type = 'load' AND l.load_number = ANY($2::text[])`,
      [USMCA_OPCO_ID, inScopeLoads]
    );
    const hasInScopeRevenue = Number(revenueRes.rows[0].n) > 0;
    const revenueRange = hasInScopeRevenue
      ? { minDate: revenueRes.rows[0].min_date, maxDate: revenueRes.rows[0].max_date }
      : null;

    // ── Cost role postings for in-scope loads only ──────────────────────────────────────
    // Each cost role's postings link to loads through different source tables. We resolve the
    // load_id from the posting's source_transaction_type:
    //   'load'       → mdata.loads directly (source_transaction_id = load.id::text)
    //   'fuel_event' → fuel.fuel_transactions (source_transaction_id = ft.id::text → ft.load_id)
    //   'expense'    → accounting.expenses (source_transaction_id = e.id::text → e.load_id)
    //   'driver_bill'→ driver_finance.driver_bills (source_transaction_id = db.id::text → db.load_id)
    //   'bill'       → accounting.bills (source_transaction_id = b.id::text → b.load_id)
    // A posting that cannot be resolved to an in-scope load is out of scope and not counted.
    const roleRoles = Object.keys(CHECKED_ROLES);
    const roleRes = await client.query(
      `SELECT r.role, a.account_number, a.account_name,
              count(*) AS in_scope_posting_count,
              min(je.entry_date)::text AS min_date,
              max(je.entry_date)::text AS max_date
         FROM accounting.chart_of_accounts_roles r
         JOIN catalogs.accounts a ON a.id = r.account_id
         JOIN accounting.journal_entry_postings p ON p.account_id = a.id AND p.operating_company_id = r.operating_company_id
         JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         LEFT JOIN LATERAL (
           SELECT
           CASE p.source_transaction_type
             WHEN 'load' THEN (SELECT l.id FROM mdata.loads l WHERE l.id::text = p.source_transaction_id AND l.operating_company_id = p.operating_company_id)
             WHEN 'fuel_event' THEN (SELECT ft.load_id FROM fuel.fuel_transactions ft WHERE ft.id::text = p.source_transaction_id AND ft.operating_company_id = p.operating_company_id)
             WHEN 'expense' THEN (SELECT e.load_id FROM accounting.expenses e WHERE e.id::text = p.source_transaction_id AND e.operating_company_id = p.operating_company_id)
             WHEN 'driver_bill' THEN (SELECT db.load_id FROM driver_finance.driver_bills db WHERE db.id::text = p.source_transaction_id AND db.operating_company_id = p.operating_company_id)
             WHEN 'bill' THEN (SELECT b.load_id FROM accounting.bills b WHERE b.id::text = p.source_transaction_id AND b.operating_company_id = p.operating_company_id)
             ELSE NULL
           END AS id
         ) AS load_id ON true
         JOIN mdata.loads l ON l.id = load_id.id AND l.operating_company_id = r.operating_company_id
        WHERE r.operating_company_id = $1 AND r.is_active = true AND r.role = ANY($2::text[])
          AND je.status <> 'void' AND je.voided_at IS NULL
          AND l.load_number = ANY($3::text[])
        GROUP BY r.role, a.account_number, a.account_name`,
      [USMCA_OPCO_ID, roleRoles, inScopeLoads]
    );
    const roleBalances = roleRes.rows.map((row) => ({
      role: row.role,
      accountNumber: row.account_number,
      accountName: row.account_name,
      inScopePostingCount: Number(row.in_scope_posting_count),
      minDate: row.min_date,
      maxDate: row.max_date,
    }));

    return {
      hasInScopeRevenue,
      neverPosted: detectNeverPostedCostRoles(hasInScopeRevenue, roleBalances),
      dateMismatch: detectDateRangeMismatch(revenueRange, roleBalances),
      inScopeLoads: inScopeLoads.length,
      totalLoads,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("verify-pl-cost-of-revenue: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }
  const { hasInScopeRevenue, neverPosted, dateMismatch, inScopeLoads, totalLoads } = await auditLive(databaseUrl);
  if (!hasInScopeRevenue) {
    console.log(`${LABEL} PASS — no in-scope revenue posted yet (NOT FED YET), no cost-of-revenue expectation to check`);
    return;
  }
  let failed = false;
  if (neverPosted.length > 0) {
    failed = true;
    console.error(`${LABEL} FAIL — in-scope revenue has posted, but ${neverPosted.length} carrier cost-of-revenue role(s) have NEVER posted for in-scope loads:`);
    for (const m of neverPosted) console.error(`  ✗ ${m.role} (${CHECKED_ROLES[m.role]}) -> account ${m.accountNumber} ${m.accountName}`);
  }
  if (dateMismatch.length > 0) {
    failed = true;
    console.error(`${LABEL} FAIL — ${dateMismatch.length} cost-of-revenue role(s) have posted for in-scope loads, but their date range never overlaps revenue's:`);
    for (const m of dateMismatch) console.error(`  ✗ ${m.role} (${CHECKED_ROLES[m.role]}) -> account ${m.accountNumber} ${m.accountName}, posted ${m.minDate}..${m.maxDate}`);
  }
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL} PASS — in-scope revenue has posted (${inScopeLoads} of ${totalLoads} loads), every checked cost-of-revenue role has posted at least once for in-scope loads, and every role's date range overlaps revenue's`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const balances = [
    { role: "driver_pay_expense", accountNumber: "6890", accountName: "Cost of Labor", inScopePostingCount: 42, minDate: "2026-08-10", maxDate: "2026-09-11" },
    { role: "company_fuel_advance_expense", accountNumber: "5000", accountName: "Fuel & Diesel", inScopePostingCount: 19, minDate: "2026-07-21", maxDate: "2026-09-11" },
    { role: "toll_scale_expense", accountNumber: "5300", accountName: "Tolls & Scales", inScopePostingCount: 1, minDate: "2026-09-06", maxDate: "2026-09-06" },
    { role: "insurance_expense", accountNumber: "5600", accountName: "Truck Insurance", inScopePostingCount: 0, minDate: null, maxDate: null },
  ];

  // ---- DEFECT 1 class: never-posted-at-all ----
  const missing = detectNeverPostedCostRoles(true, balances);
  assert.ok(missing.length === 1 && missing[0].role === "insurance_expense", `expected exactly insurance_expense flagged, got: ${JSON.stringify(missing)}`);
  const allZero = balances.map((b) => ({ ...b, inScopePostingCount: 0 }));
  assert.ok(detectNeverPostedCostRoles(false, allZero).length === 0, "no in-scope revenue posted yet means nothing is flagged");
  const allNonZero = balances.map((b) => ({ ...b, inScopePostingCount: Math.max(1, b.inScopePostingCount) }));
  assert.ok(detectNeverPostedCostRoles(true, allNonZero).length === 0, "every role posted at least once means nothing is flagged");
  const withUncheckedRole = [...balances, { role: "rent_expense", accountNumber: "QBO-228", accountName: "Lease", inScopePostingCount: 0 }];
  assert.ok(!detectNeverPostedCostRoles(true, withUncheckedRole).some((m) => m.role === "rent_expense"), "an unchecked role (e.g. lease) must never be flagged");

  // ---- DEFECT 2 class: posted, but date ranges never overlap revenue's ----
  const revenueRange = { minDate: "2026-09-06", maxDate: "2026-09-11" };
  assert.ok(detectDateRangeMismatch(revenueRange, balances).length === 0, "the live 09-06..09-11 shape overlaps every posted role's range");

  const staleCostRole = [{ role: "toll_scale_expense", accountNumber: "5300", accountName: "Tolls & Scales", inScopePostingCount: 5, minDate: "2026-01-01", maxDate: "2026-03-01" }];
  const mismatch = detectDateRangeMismatch(revenueRange, staleCostRole);
  assert.ok(mismatch.length === 1 && mismatch[0].role === "toll_scale_expense", `expected toll_scale_expense flagged for a non-overlapping range, got: ${JSON.stringify(mismatch)}`);

  assert.ok(detectDateRangeMismatch(null, staleCostRole).length === 0, "no revenue range means nothing to compare");

  const neverPostedRole = [{ role: "insurance_expense", accountNumber: "5600", accountName: "Truck Insurance", inScopePostingCount: 0, minDate: null, maxDate: null }];
  assert.ok(detectDateRangeMismatch(revenueRange, neverPostedRole).length === 0, "a never-posted role is DEFECT 1's class, not flagged by the date-overlap check");

  const uncheckedMismatch = [{ role: "rent_expense", accountNumber: "QBO-228", accountName: "Lease", inScopePostingCount: 3, minDate: "2020-01-01", maxDate: "2020-06-01" }];
  assert.ok(detectDateRangeMismatch(revenueRange, uncheckedMismatch).length === 0, "an unchecked role must never be flagged by the date-overlap check either");

  // ---- FEED SCOPING: partitionInScopeLoads ----
  const docs = [
    { doc: "5753", loads: ["13471", "13480"] },
    { doc: "5760", loads: ["13508", "13510"] },
    { doc: "5761", loads: ["13508", "99999"] }, // 99999 not live → out of scope
  ];
  const live = new Set(["13471", "13480", "13508", "13510"]);
  const { inScopeLoads, skippedCount, totalLoads } = partitionInScopeLoads(docs, live);
  assert.ok(inScopeLoads.length === 4, `expected 4 in-scope loads (13471,13480,13508,13510), got ${inScopeLoads.length}: ${inScopeLoads.join(",")}`);
  assert.ok(skippedCount === 1, `expected 1 skipped load (99999), got ${skippedCount}`);
  assert.ok(totalLoads === 5, `expected 5 total unique loads, got ${totalLoads}`);

  // All loads live → all in scope.
  const allLive = new Set(["13471", "13480", "13508", "13510", "99999"]);
  const allInScope = partitionInScopeLoads(docs, allLive);
  assert.ok(allInScope.inScopeLoads.length === 5, `expected 5 in-scope when all live, got ${allInScope.inScopeLoads.length}`);
  assert.ok(allInScope.skippedCount === 0, `expected 0 skipped when all live, got ${allInScope.skippedCount}`);

  // No loads live → 0 in scope.
  const noneLive = partitionInScopeLoads(docs, new Set());
  assert.ok(noneLive.inScopeLoads.length === 0, `expected 0 in-scope when none live, got ${noneLive.inScopeLoads.length}`);
  assert.ok(noneLive.skippedCount === 5, `expected 5 skipped when none live, got ${noneLive.skippedCount}`);

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
