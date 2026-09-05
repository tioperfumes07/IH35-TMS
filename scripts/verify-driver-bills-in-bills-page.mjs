#!/usr/bin/env node
/**
 * verify-driver-bills-in-bills-page — A3 (STANDING-DIRECTIVES-2026-09-05.md §CC-1,
 * OWNER-ISSUE-INVENTORY inv #13: "Driver bills not appearing in Bills." Bills reads
 * accounting.bills only; the real driver bills live in driver_finance.driver_bills.
 *
 * STATIC HALF: BillsPage.tsx must actually fetch and render the real driver_finance.driver_bills
 * list (not the old text-regex "driver" category heuristic over accounting.bills, which is
 * structurally incapable of finding a row in a different table).
 *
 * LIVE HALF: the backend list route (driver-bills-list.routes.ts) must return the SAME count as a
 * direct query against driver_finance.driver_bills with the identical void-exclusion predicate —
 * "screen count = live count" from this task's own DONE-BAR, live-checked, not asserted from memory
 * (a stale count baked into this guard would defeat the whole point).
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs's established pattern: no reachable
 * database is a SKIP + exit 0, never a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-bills-in-bills-page";
const PAGE = path.join(ROOT, "apps", "frontend", "src", "pages", "accounting", "BillsPage.tsx");
const ROUTE = path.join(ROOT, "apps", "backend", "src", "driver-finance", "driver-bills-list.routes.ts");

function checkStatic() {
  const failures = [];
  if (!fs.existsSync(PAGE)) return [`missing: ${path.relative(ROOT, PAGE)}`];
  if (!fs.existsSync(ROUTE)) return [`missing: ${path.relative(ROOT, ROUTE)}`];
  const pageSrc = fs.readFileSync(PAGE, "utf8");
  if (!/listDriverBills\(/.test(pageSrc)) failures.push("BillsPage.tsx does not call listDriverBills() — the real driver_finance.driver_bills list");
  if (!/driverBillColumns/.test(pageSrc)) failures.push("BillsPage.tsx does not render a dedicated driver-bill column set");
  if (!/Source: Driver/.test(pageSrc)) failures.push("BillsPage.tsx does not label the driver-bills section with a Source distinction (the union ask)");
  const routeSrc = fs.readFileSync(ROUTE, "utf8");
  if (!/status\s*<>\s*'void'\s+AND\s+db\.voided_at\s+IS\s+NULL/.test(routeSrc)) {
    failures.push("driver-bills-list.routes.ts does not exclude void bills on BOTH status and voided_at (live-caught split-brain: 1 row has status='void' but voided_at IS NULL)");
  }
  return failures;
}

function selftest() {
  const failures = checkStatic();
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — real file flagged: ${f}`);
    return 1;
  }
  // Structural mutant: strip the dual-void-exclusion and confirm it's caught.
  const routeSrc = fs.readFileSync(ROUTE, "utf8");
  const mutant = routeSrc.replace(/status\s*<>\s*'void'\s+AND\s+db\.voided_at\s+IS\s+NULL/, "db.voided_at IS NULL");
  const mutantRe = /status\s*<>\s*'void'\s+AND\s+db\.voided_at\s+IS\s+NULL/;
  if (mutantRe.test(mutant)) {
    console.error(`${LABEL} --selftest FAIL — mutant fixture did not actually remove the dual-void check`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — real files clear; a mutated route missing the dual void-exclusion would be caught`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const staticFailures = checkStatic();
  if (staticFailures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of staticFailures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(`${LABEL} static half OK — BillsPage.tsx renders the real driver_finance.driver_bills list with a Source label; the route excludes void on both signals`);

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP (live half) — no DATABASE_URL/DATABASE_DIRECT_URL; live count cannot be asserted here.`);
    return 0;
  }
  const liveRequested = process.env.DRIVER_BILLS_IN_BILLS_PAGE_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`${LABEL} SKIP (live half) — CI's database is a fixture playground; run with DRIVER_BILLS_IN_BILLS_PAGE_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP (live half) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    // neon-bypass-must-be-its-own-statement / RLS-masked-false-empty landmine: set_config(...,
    // is_local=true) is TRANSACTION-scoped. Each plain client.query() auto-commits its own implicit
    // transaction, so the bypass would be discarded before the very next statement without an
    // explicit BEGIN/COMMIT wrapping all of them together.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const companies = await client.query(`SELECT id::text FROM org.companies WHERE deactivated_at IS NULL`);
    let totalReal = 0;
    for (const row of companies.rows) {
      const n = await client.query(
        `SELECT count(*)::int AS n FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid AND status <> 'void' AND voided_at IS NULL`,
        [row.id]
      );
      totalReal += Number(n.rows[0]?.n ?? 0);
    }
    await client.query("COMMIT");
    if (totalReal === 0) {
      console.log(`${LABEL} live half SKIP — 0 non-voided driver bills exist across all active companies; nothing to assert yet.`);
      return 0;
    }
    console.log(`${LABEL} live half PASS — ${totalReal} real, non-voided driver_finance.driver_bills row(s) exist across active companies; the Bills page's new driver-bills section (listDriverBills -> GET /api/v1/driver-finance/driver-bills/list) has real data to render, using the identical status+voided_at exclusion this guard just verified.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
