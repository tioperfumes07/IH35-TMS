#!/usr/bin/env node
/**
 * WAVE-H2 write-path live proof guard (owner carry 2026-07-31).
 *
 * Null-rate reporting is NOT proof. This guard locks the CI db.test that POSTs:
 *   - /api/v1/expenses with load_id → asserts accounting.expenses.load_id
 *   - /api/v1/accounting/invoices/from-load → asserts accounting.invoices.source_load_id
 *
 * Mutation-tested (--selftest).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-h2-writepath-live-proof";
const SELFTEST = process.argv.includes("--selftest");
const TEST_REL = "apps/backend/src/accounting/__tests__/wave-h2-writepath-ops-fk.db.test.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

export function staticChecks(source) {
  const problems = [];
  const src = source ?? read(TEST_REL);

  if (!/GITHUB_ACTIONS/.test(src)) {
    problems.push("db.test must gate on GITHUB_ACTIONS (CI Postgres)");
  }
  if (!/url:\s*"\/api\/v1\/expenses"/.test(src)) {
    problems.push("must inject POST /api/v1/expenses");
  }
  // Expense create returns 201 Created on insert — asserting 200-only is a false red on CI.
  // Require the expense-specific assert (url "/api/v1/expenses" block accepts [200, 201]).
  if (!/url:\s*"\/api\/v1\/expenses"[\s\S]{0,800}\[200,\s*201\]/.test(src)) {
    problems.push("expense create must accept status [200, 201] (201 Created on insert)");
  }
  if (!/load_id:\s*loadId/.test(src)) {
    problems.push("expense payload must send load_id");
  }
  if (!/FROM accounting\.expenses WHERE id/.test(src)) {
    problems.push("must SELECT load_id FROM accounting.expenses after create");
  }
  if (!/url:\s*`\/api\/v1\/accounting\/invoices\/from-load/.test(src)) {
    problems.push("must inject POST /api/v1/accounting/invoices/from-load");
  }
  if (!/FROM accounting\.invoices WHERE id/.test(src)) {
    problems.push("must SELECT source_load_id FROM accounting.invoices after from-load");
  }
  if (!/expect\(rows\[0\]\?\.load_id\)\.toBe\(loadId\)/.test(src)) {
    problems.push("must assert expense.load_id === loadId");
  }
  if (!/expect\(rows\[0\]\?\.source_load_id\)\.toBe\(loadId\)/.test(src)) {
    problems.push("must assert invoice.source_load_id === loadId");
  }
  return problems;
}

function selftest() {
  const good = read(TEST_REL);
  const badMissingExpense = good.replace(/url:\s*"\/api\/v1\/expenses"/, 'url: "/api/v1/nope"');
  const badMissingAssert = good.replace(
    /expect\(rows\[0\]\?\.load_id\)\.toBe\(loadId\)/,
    "expect(true).toBe(true)",
  );
  const badStatus200Only = good.replace(
    /(url:\s*"\/api\/v1\/expenses"[\s\S]{0,800})\[200,\s*201\]/,
    "$1[200]",
  );
  if (staticChecks(good).length) fail("selftest: clean fixture must PASS");
  if (!staticChecks(badMissingExpense).length) fail("selftest: missing expense POST must FAIL");
  if (!staticChecks(badMissingAssert).length) fail("selftest: missing load_id assert must FAIL");
  if (!staticChecks(badStatus200Only).length) fail("selftest: 200-only status assert must FAIL");
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  if (!fs.existsSync(path.join(ROOT, TEST_REL))) {
    fail(`missing ${TEST_REL}`);
  }
  const problems = staticChecks();
  if (problems.length) fail(problems.join("; "));
  console.log(`${LABEL} PASS — WAVE-H2 write-path db.test locked (expense load_id + invoice source_load_id)`);
}

main();
