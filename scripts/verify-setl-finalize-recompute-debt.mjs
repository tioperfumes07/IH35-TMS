#!/usr/bin/env node
/**
 * SETL-FINALIZE-RECOMPUTE-DEBT — Finalize/list must not 25P02 when recompute fails/missing;
 * migration must define driver_finance.recompute_driver_debt(uuid).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-setl-finalize-recompute-debt";

const ROUTES = path.join(ROOT, "apps/backend/src/driver-finance/settlements.routes.ts");
const MIGRATION = path.join(ROOT, "db/migrations/202612471500_create_recompute_driver_debt.sql");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

// texts: optional in-memory overrides {routes, mig} so --selftest plants into a string, never a file.
function audit(texts = {}) {
  const problems = [];
  if (texts.routes === undefined && !fs.existsSync(ROUTES)) problems.push(`missing ${ROUTES}`);
  else {
    const src = texts.routes ?? fs.readFileSync(ROUTES, "utf8");
    if (!/await client\.query\(\s*["']SAVEPOINT recompute_debt_sync["']\s*\)/.test(src)) {
      problems.push("settlements.routes.ts recomputeDebtSync must use SAVEPOINT recompute_debt_sync");
    }
    if (!src.includes("ROLLBACK TO SAVEPOINT recompute_debt_sync")) {
      problems.push("settlements.routes.ts must ROLLBACK TO SAVEPOINT on recompute failure");
    }
    if (!/recompute_driver_debt\s*\(/.test(src)) {
      problems.push("settlements.routes.ts must still call recompute_driver_debt");
    }
  }
  if (texts.mig === undefined && !fs.existsSync(MIGRATION)) problems.push(`missing migration ${MIGRATION}`);
  else {
    const sql = texts.mig ?? fs.readFileSync(MIGRATION, "utf8");
    if (
      !/CREATE OR REPLACE FUNCTION\s+driver_finance\.recompute_driver_debt\s*\(\s*uuid\s*\)/i.test(sql) &&
      !/CREATE OR REPLACE FUNCTION\s+driver_finance\.recompute_driver_debt\s*\(\s*p_driver_id\s+uuid\s*\)/i.test(sql)
    ) {
      problems.push("migration must CREATE OR REPLACE FUNCTION driver_finance.recompute_driver_debt(uuid)");
    }
    if (!/GRANT EXECUTE ON FUNCTION driver_finance\.recompute_driver_debt/i.test(sql)) {
      problems.push("migration must GRANT EXECUTE to ih35_app");
    }
  }
  return problems;
}

function selftest() {
  const routes = fs.readFileSync(ROUTES, "utf8");
  const mig = fs.readFileSync(MIGRATION, "utf8");
  if (!routes.includes('await client.query("SAVEPOINT recompute_debt_sync")')) {
    fail("selftest precondition: settlements.routes.ts must contain SAVEPOINT recompute_debt_sync");
  }
  let planted = 0;

  const brokenRoutes = routes.replace(
    'await client.query("SAVEPOINT recompute_debt_sync")',
    'await client.query("SAVEPOINT __plant_missing__")'
  );
  if (audit({ routes: brokenRoutes }).length === 0) fail("selftest: expected FAIL after removing SAVEPOINT");
  planted += 1;

  const brokenMig = mig.replaceAll("recompute_driver_debt", "recompute_driver_debt_REMOVED");
  if (audit({ mig: brokenMig }).length === 0) fail("selftest: expected FAIL after renaming function in migration");
  planted += 1;

  const clean = audit();
  if (clean.length) fail(`selftest cleanup still red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "audit";
if (mode === "selftest") selftest();
else {
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS`);
}
