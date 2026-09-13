#!/usr/bin/env node
// ROUND 20.9 ITEM 1 (Claude Lead, 2026-09-12 18:20 CT/23:20Z): the Accounting home P&L showed
// Revenue $218,074.91 / Gross profit $188,412.13 (86.4%) / Net income $184,219.69 (84.5% net
// margin) -- impossible for a trucking carrier (8-15% is a good year). The ledger math was
// internally consistent (reconciled exactly to accounting.journal_entry_postings); the defect was
// upstream of the ledger: real cost-of-revenue sources that should post never did.
//
// ROOT CAUSE FOUND (POSTING defect, code): apps/backend/src/insurance/policy.routes.ts's
// POST /api/v1/insurance/policies (create) never called createPolicyBillSchedule -- only
// POST .../renew did, despite the service's own doc comment saying it should run "after a new
// insurance.policy is created." Every brand-new (non-renewal) policy silently got no bill
// schedule and could never post a premium expense. Confirmed live: 3 real active USMCA policies
// (Cimarron auto_liability $206,372.39, Lloyds physical_damage $43,590.18, Lloyds cargo
// $21,317.84 -- $271,280.41/yr combined) had ZERO postings, ever, to their role-bound accounts
// (5600 Truck Insurance / 6600 Insurance Expense). Fixed in the same PR; this guard locks it.
//
// This guard: for each carrier cost-of-revenue ROLE this repo defines in
// accounting.chart_of_accounts_roles (driver_pay_expense, company_fuel_advance_expense,
// toll_scale_expense, insurance_expense, maintenance_parts_expense, heavy_repair_expense), when
// the company has ANY posted revenue (revenue_default role account) ever, that role's bound
// account must have carried at least ONE posting, ever. A role that has NEVER posted despite
// revenue existing is exactly the insurance shape this item found -- not a period-specific dip,
// a total, structural gap. RATCHET-free (a hard 0-gate on "never, ever posted"), because a role
// that legitimately never applies to a given entity (e.g. no lease at all) is scoped out of the
// CHECKED_ROLES list below, not baselined -- see the note on lease/rent_expense.
//
// NOT a ratchet like verify-load-settlement-linkage.mjs's ORPHAN class: "never posted at all,
// forever" is unambiguous -- there is no legitimate reading where a real revenue-generating
// carrier has an active driver-pay/fuel/insurance role account that has NEVER once posted.
// Maintenance (maintenance_parts_expense / heavy_repair_expense) is intentionally left OUT of
// CHECKED_ROLES: unlike insurance (a signed policy obligates a premium whether or not a claim
// happens), maintenance cost is event-driven -- zero completed work orders can be a genuine,
// non-defective fact (confirmed live for USMCA: 17 work orders, all status='cancelled', zero
// completed -- nothing SHOULD have posted). Lease (lease_recovery/rent_expense) is also left out:
// whether an entity pays lease vs owns its equipment outright is a real business-structure fact,
// not something this guard can assert without leasing data of its own.
//
// LIVE-DATA CHECK: requires DATABASE_URL pointed at a read-only prod role (same convention as
// verify-load-settlement-linkage.mjs). SKIPs (not fails) without one.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pl-cost-of-revenue";
const USMCA_OPCO_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Role -> human label. Each of these MUST have posted at least once if the company has ever
// posted revenue at all. See the file header for why maintenance/lease are intentionally excluded.
export const CHECKED_ROLES = {
  driver_pay_expense: "driver pay / cost of labor",
  company_fuel_advance_expense: "fuel",
  toll_scale_expense: "tolls & scales",
  insurance_expense: "insurance",
};

/**
 * Pure: given whether the company has EVER posted revenue, and each checked role's all-time
 * posting count, which roles are missing entirely?
 * @param {boolean} hasEverPostedRevenue
 * @param {{role: string, accountNumber: string, accountName: string, allTimePostingCount: number}[]} roleBalances
 */
export function detectNeverPostedCostRoles(hasEverPostedRevenue, roleBalances) {
  if (!hasEverPostedRevenue) return [];
  return roleBalances.filter((r) => Object.hasOwn(CHECKED_ROLES, r.role) && r.allTimePostingCount === 0);
}

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const revenueRes = await client.query(
      `SELECT count(*) AS n
         FROM accounting.journal_entry_postings p
         JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id
        WHERE p.operating_company_id = $1 AND r.role = 'revenue_default' AND r.is_active = true
          AND p.debit_or_credit = 'credit'`,
      [USMCA_OPCO_ID]
    );
    const hasEverPostedRevenue = Number(revenueRes.rows[0].n) > 0;

    const roleRoles = Object.keys(CHECKED_ROLES);
    const roleRes = await client.query(
      `SELECT r.role, a.account_number, a.account_name,
              (SELECT count(*) FROM accounting.journal_entry_postings p
                WHERE p.account_id = a.id AND p.operating_company_id = $1) AS all_time_posting_count
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
    }));

    return { hasEverPostedRevenue, missing: detectNeverPostedCostRoles(hasEverPostedRevenue, roleBalances) };
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
  const { hasEverPostedRevenue, missing } = await auditLive(databaseUrl);
  if (!hasEverPostedRevenue) {
    console.log(`${LABEL} PASS — no posted revenue yet, no cost-of-revenue expectation to check`);
    return;
  }
  if (missing.length > 0) {
    console.error(`${LABEL} FAIL — revenue has posted, but ${missing.length} carrier cost-of-revenue role(s) have NEVER posted:`);
    for (const m of missing) console.error(`  ✗ ${m.role} (${CHECKED_ROLES[m.role]}) -> account ${m.accountNumber} ${m.accountName}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL} PASS — revenue has posted, and every checked cost-of-revenue role has posted at least once`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const balances = [
    { role: "driver_pay_expense", accountNumber: "6890", accountName: "Cost of Labor", allTimePostingCount: 42 },
    { role: "company_fuel_advance_expense", accountNumber: "5000", accountName: "Fuel & Diesel", allTimePostingCount: 19 },
    { role: "toll_scale_expense", accountNumber: "5300", accountName: "Tolls & Scales", allTimePostingCount: 1 },
    { role: "insurance_expense", accountNumber: "5600", accountName: "Truck Insurance", allTimePostingCount: 0 },
  ];

  // The exact live shape this item found: revenue exists, insurance has never posted.
  const missing = detectNeverPostedCostRoles(true, balances);
  assert.ok(missing.length === 1 && missing[0].role === "insurance_expense", `expected exactly insurance_expense flagged, got: ${JSON.stringify(missing)}`);

  // No revenue posted yet at all -> nothing to check, even if every role is at 0 (a brand-new,
  // not-yet-operating entity is not a defect).
  const allZero = balances.map((b) => ({ ...b, allTimePostingCount: 0 }));
  assert.ok(detectNeverPostedCostRoles(false, allZero).length === 0, "no revenue posted yet means nothing is flagged");

  // Every role posting at least once (the post-fix state) -> nothing flagged.
  const allNonZero = balances.map((b) => ({ ...b, allTimePostingCount: Math.max(1, b.allTimePostingCount) }));
  assert.ok(detectNeverPostedCostRoles(true, allNonZero).length === 0, "every role posted at least once means nothing is flagged");

  // A role not in CHECKED_ROLES (e.g. lease) must never be flagged even at 0 — this guard only
  // asserts on the roles it explicitly checks.
  const withUncheckedRole = [...balances, { role: "rent_expense", accountNumber: "QBO-228", accountName: "Lease", allTimePostingCount: 0 }];
  const missing2 = detectNeverPostedCostRoles(true, withUncheckedRole);
  assert.ok(!missing2.some((m) => m.role === "rent_expense"), "an unchecked role (e.g. lease) must never be flagged");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
