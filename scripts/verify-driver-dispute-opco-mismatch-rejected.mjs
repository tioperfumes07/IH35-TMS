#!/usr/bin/env node
/**
 * ACCT-F5572 regression guard — driver-facing settlement-dispute routes must reject
 * a caller-supplied operating_company_id that doesn't match the driver's own company.
 *
 * driver/settlement-disputes-p6.routes.ts took `operating_company_id` from the query
 * string, unchecked, and both wrote it onto the new dispute row and used it as the RLS
 * GUC. driver_finance.driver_settlement_disputes RLS has no membership clause (GUC-only
 * `operating_company_id = current_setting(...)`), so a mismatched value here doesn't
 * leak another company's rows (driver_id/settlement_id ownership is enforced downstream)
 * -- but it silently mislabels the driver's OWN dispute with the wrong
 * operating_company_id, orphaning it from every office-side query that joins on
 * d.operating_company_id = s.operating_company_id.
 *
 * Fix: derive the driver's real operating_company_id from their own session row
 * (mdata.drivers, via requireDriverSession) and reject (403) any request whose query
 * param disagrees, instead of trusting the caller.
 *
 * This static check (no DB connection) asserts:
 *   1. driver/auth.ts's DriverSession type carries operating_company_id.
 *   2. driver/auth.ts's session-lookup SQL actually selects d.operating_company_id.
 *   3. Each of the 3 driver-facing dispute routes checks
 *      query.data.operating_company_id !== driver.operating_company_id and 403s before
 *      calling into the service layer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:driver-dispute-opco-mismatch-rejected";
const SELFTEST = process.argv.includes("--selftest");

const AUTH_FILE = "apps/backend/src/driver/auth.ts";
const ROUTES_FILE = "apps/backend/src/driver/settlement-disputes-p6.routes.ts";

function assertAll(srcs) {
  const problems = [];

  const auth = srcs[AUTH_FILE];
  if (!/operating_company_id:\s*string;?/.test(auth)) {
    problems.push(`${AUTH_FILE}: DriverSession type missing operating_company_id`);
  }
  if (!/d\.operating_company_id/.test(auth)) {
    problems.push(`${AUTH_FILE}: driver session lookup no longer selects d.operating_company_id`);
  }

  const routes = srcs[ROUTES_FILE];
  const mismatchChecks = (routes.match(/query\.data\.operating_company_id\s*!==\s*driver\.operating_company_id/g) ?? []).length;
  if (mismatchChecks < 3) {
    problems.push(`${ROUTES_FILE}: expected 3 operating_company_id mismatch checks (one per driver-facing dispute route), found ${mismatchChecks}`);
  }

  return problems;
}

const read = () => ({
  [AUTH_FILE]: fs.readFileSync(path.join(ROOT, AUTH_FILE), "utf8"),
  [ROUTES_FILE]: fs.readFileSync(path.join(ROOT, ROUTES_FILE), "utf8"),
});

if (SELFTEST) {
  const srcs = read();

  // Plant defect 1: drop one of the three mismatch checks (simulate a route regressing
  // back to trusting the caller-supplied operating_company_id unchecked).
  const planted1 = { ...srcs };
  planted1[ROUTES_FILE] = planted1[ROUTES_FILE].replace(
    /if \(query\.data\.operating_company_id !== driver\.operating_company_id\) \{\s*return reply\.code\(403\)\.send\(\{ error: "forbidden" \}\);\s*\}\s*\n\s*try \{\s*const created = await submitSettlementDisputeP6/,
    "try {\n      const created = await submitSettlementDisputeP6",
  );
  if (planted1[ROUTES_FILE] === srcs[ROUTES_FILE]) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 1 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted1).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 1 (missing /dispute mismatch check) not caught`);
    process.exit(1);
  }

  // Plant defect 2: strip operating_company_id back out of the session type + SQL.
  const planted2 = { ...srcs };
  planted2[AUTH_FILE] = planted2[AUTH_FILE]
    .replace(/\n\s*operating_company_id: string;/, "")
    .replace(/,\s*\n\s*d\.operating_company_id::text AS operating_company_id/, "");
  if (planted2[AUTH_FILE] === srcs[AUTH_FILE]) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 2 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted2).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 2 (DriverSession losing operating_company_id) not caught`);
    process.exit(1);
  }

  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
