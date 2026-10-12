#!/usr/bin/env node
// FIXED-MONTHLY-COST-RUNG-RULE (SET-29, "Attribution rung 3, fixed-monthly-cost rule") — docs/LAW.md
// §3: "Fixed monthly costs — insurance, plates, the truck note — do not belong on a trip at all.
// They are period costs on the unit. Forcing them into a settlement makes trip margin meaningless."
// Investigated live 2026-09-09: no code path was found that forces these costs onto a load (rung-3
// mile allocation only ever operates on a pool already scoped by load_id — see
// load-cost-rollup.sql.ts / load-unit-cost-split.routes.ts, both of which SELECT rows that already
// carry load_id, never join a fixed-cost account in). The rule holds structurally because
// `accounting.line_category_load_required` never lists insurance/plates/registration/notes-payable
// among its 9 load-required categories, so nothing forces a load_id onto them at entry either.
// Live-verified clean across every insurance/plates/registration/equipment-loan account on prod:
// 0 of 406 accounting.expense_lines rows and 0 of 3,974 accounting.bill_lines rows on those accounts
// carry a load_id. This guard is a LIVE-DATA assertion (not a static code guard, matching the
// convention of verify-settlement-lines-load-id-backfilled.mjs) — it exists to catch the FIRST time
// this ever regresses (a future bill/expense entry, an import, or a UI change that lets a fixed
// monthly cost get tagged to a load), per LAW.md's own "guards before the first row" philosophy.
//
// Usage: DATABASE_URL=<prod> node scripts/verify-fixed-monthly-costs-never-attach-to-load.mjs
import pg from "pg";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B) and runs in money-pr-local-gate.mjs when its owned paths change (Lead ROUND 84, E7 batch 2)";

const LABEL = "verify-fixed-monthly-costs-never-attach-to-load";

// Matches by account NAME substring, not a coa_role (none of these accounts carry one) — deliberately
// broad enough to catch every insurance/plates/registration/notes-payable account already on prod
// across all 3 entities (TRANSP/TRK/USMCA), narrow enough to never match an over-the-road expense
// account (fuel, tolls, repairs — the 9 categories that DO require a load).
const NAME_PATTERNS = ["%insurance%", "%plate%", "%registration%", "%note payable%", "%notes payable%", "%equipment loan%"];

/** True when an account name is a fixed-monthly-cost account (the SQL ILIKE patterns, in JS). */
export function isFixedMonthlyAccount(name) {
  const n = String(name ?? "").toLowerCase();
  return NAME_PATTERNS.some((p) => n.includes(p.replaceAll("%", "")));
}
/** Violations = load-tagged rows on a fixed-monthly-cost account (pure — --selftest plants into it). */
export function fixedCostViolations(rows) {
  return rows.filter((r) => r.load_id && isFixedMonthlyAccount(r.account_name));
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["a load-tagged fuel line is not a violation", fixedCostViolations([{ id: "1", account_name: "Fuel & Diesel", load_id: "L" }]).length === 0],
    ["an insurance line without a load is not a violation", fixedCostViolations([{ id: "2", account_name: "Truck Insurance", load_id: null }]).length === 0],
    ["a load-tagged insurance line is caught", fixedCostViolations([{ id: "3", account_name: "Truck Insurance", load_id: "L" }]).length === 1],
    ["a load-tagged plates / notes payable line is caught", fixedCostViolations([{ id: "4", account_name: "License Plates", load_id: "L" }, { id: "5", account_name: "Notes Payable - Truck", load_id: "L" }]).length === 2],
  ];
  const bad = cases.filter(([, ok]) => !ok).length;
  for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
  console.log(bad ? `${LABEL} --selftest FAIL (${cases.length - bad}/${cases.length} caught)` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  // GATE-LIVELOCK-01 / dead-port-forbidden: skip cleanly with no DATABASE_URL (static sweep), run
  // for real only when a caller deliberately sets it — same convention as every other live-data
  // verify-step this session (e.g. verify-settlement-lines-load-id-backfilled.mjs).
  if (!url) {
    console.error("verify-fixed-monthly-costs-never-attach-to-load: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const nameClause = NAME_PATTERNS.map((_, i) => `ca.account_name ILIKE $${i + 1}`).join(" OR ");
    const expenseRes = await client.query(
      `SELECT el.id, ca.account_name, el.load_id
         FROM accounting.expense_lines el
         JOIN catalogs.accounts ca ON ca.id = el.expense_account_uuid
        WHERE el.load_id IS NOT NULL AND (${nameClause})`,
      NAME_PATTERNS
    );
    const billRes = await client.query(
      `SELECT bl.id, ca.account_name, bl.load_id
         FROM accounting.bill_lines bl
         JOIN catalogs.accounts ca ON ca.id = bl.account_id
        WHERE bl.load_id IS NOT NULL AND (${nameClause})`,
      NAME_PATTERNS
    );
    const violations = fixedCostViolations([...expenseRes.rows, ...billRes.rows]);
    if (violations.length > 0) {
      const sample = violations.slice(0, 5).map((r) => `${r.id} (${r.account_name}) -> load_id=${r.load_id}`).join("\n  ");
      throw new Error(
        `${violations.length} row(s) attach a fixed-monthly-cost account (insurance/plates/registration/notes-payable) ` +
          `to a load — LAW.md §3: these are period costs on the unit, never a trip cost. Void/reclassify without a ` +
          `load_id. Sample:\n  ${sample}`
      );
    }
    console.log(`${LABEL} PASS -- no fixed-monthly-cost (insurance/plates/registration/notes-payable) row is attached to a load`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (!process.argv.includes("--selftest")) main().catch((err) => {
  console.error(`${LABEL} FAIL: ${err.message}`);
  process.exit(1);
});
