#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["claim","fleet_premium","late_fee"],"leaves":["insurance.posting_dates.business_date"],"task":"INS-MONEY-F6965-POSTING-DATES-USE-UTC","vertical":"column-wave"} */
/**
 * INS-MONEY-F6965-POSTING-DATES-USE-UTC (GO-0027 drain, CC-1, 2026-08-28): three insurance
 * GL-posting/comparison dates derived "today" from `new Date().toISOString().slice(0, 10)` --
 * UTC's calendar date -- instead of the canonical companyBusinessDate(). After ~19:00 Central this
 * posts the claim-recovery JE and the fleet-premium JE one calendar day ahead of the real business
 * day, and gates the late-fee cron's `due_date < today` cutoff a day early relative to the real due
 * date -- the same UTC-vs-company-timezone bug class this session already fixed for driver rate
 * dates (DRV-MONEY-F6959), customer cash-application ranges (CUST-MONEY-F6964), and maintenance
 * warranty/parts/WO-void dates (MAINT-MONEY-F6956/F6971).
 *
 * This guard asserts, against the REAL files:
 *   1. claim.routes.ts's postInsuranceClaimRecovery call uses companyBusinessDate() for
 *      entry_date_iso.
 *   2. policy-unit-fleet.service.ts's fleet-premium JE date uses companyBusinessDate().
 *   3. late-fee.service.ts's cron-tick "today" uses companyBusinessDate().
 * All three files must also import companyBusinessDate from ../lib/company-business-date.js.
 *
 * Self-test: node scripts/verify-insurance-posting-dates-business-date.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-posting-dates-business-date";
const CLAIM_FILE = "apps/backend/src/insurance/claim.routes.ts";
const FLEET_FILE = "apps/backend/src/insurance/policy-unit-fleet.service.ts";
const LATEFEE_FILE = "apps/backend/src/insurance/late-fee.service.ts";
const BAD_PATTERN = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/;
const IMPORT_PATTERN = /import\s*\{\s*companyBusinessDate\s*\}\s*from\s*"\.\.\/lib\/company-business-date\.js"/;

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(sources) {
  const failures = [];
  const claimSrc = sources ? sources.claim : (() => { try { return readReal(CLAIM_FILE); } catch { return null; } })();
  const fleetSrc = sources ? sources.fleet : (() => { try { return readReal(FLEET_FILE); } catch { return null; } })();
  const lateFeeSrc = sources ? sources.lateFee : (() => { try { return readReal(LATEFEE_FILE); } catch { return null; } })();
  if (claimSrc == null) return [`${CLAIM_FILE} not found`];
  if (fleetSrc == null) return [`${FLEET_FILE} not found`];
  if (lateFeeSrc == null) return [`${LATEFEE_FILE} not found`];

  for (const [label, src] of [[CLAIM_FILE, claimSrc], [FLEET_FILE, fleetSrc], [LATEFEE_FILE, lateFeeSrc]]) {
    if (BAD_PATTERN.test(src)) {
      const count = (src.match(new RegExp(BAD_PATTERN, "g")) ?? []).length;
      failures.push(`${label}: ${count} occurrence(s) of the raw UTC date pattern still present`);
    }
    if (!IMPORT_PATTERN.test(src)) {
      failures.push(`${label}: no longer imports companyBusinessDate`);
    }
  }
  if (!/entry_date_iso:\s*companyBusinessDate\(\)/.test(claimSrc)) {
    failures.push(`${CLAIM_FILE}: entry_date_iso must call companyBusinessDate() directly`);
  }
  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodClaim = `
    import { companyBusinessDate } from "../lib/company-business-date.js";
    entry_date_iso: companyBusinessDate(),
  `;
  const goodFleet = `
    import { companyBusinessDate } from "../lib/company-business-date.js";
    const today = companyBusinessDate();
  `;
  const goodLateFee = `
    import { companyBusinessDate } from "../lib/company-business-date.js";
    const today = companyBusinessDate();
  `;
  const regressedClaimSite = goodClaim.replace("entry_date_iso: companyBusinessDate(),", "entry_date_iso: new Date().toISOString().slice(0, 10),");
  const regressedClaimImport = goodClaim.replace('import { companyBusinessDate } from "../lib/company-business-date.js";\n    ', "");
  const regressedFleetSite = goodFleet.replace("const today = companyBusinessDate();", "const today = new Date().toISOString().slice(0, 10);");
  const regressedFleetImport = goodFleet.replace('import { companyBusinessDate } from "../lib/company-business-date.js";\n    ', "");
  const regressedLateFeeSite = goodLateFee.replace("const today = companyBusinessDate();", "const today = new Date().toISOString().slice(0, 10);");
  const regressedLateFeeImport = goodLateFee.replace('import { companyBusinessDate } from "../lib/company-business-date.js";\n    ', "");

  const checks = [
    ["fully-fixed shape produces zero failures", check({ claim: goodClaim, fleet: goodFleet, lateFee: goodLateFee }).length === 0],
    ["raw-UTC site in claim.routes.ts is caught", check({ claim: regressedClaimSite, fleet: goodFleet, lateFee: goodLateFee }).some((f) => f.includes(CLAIM_FILE) && f.includes("occurrence"))],
    ["missing import in claim.routes.ts is caught", check({ claim: regressedClaimImport, fleet: goodFleet, lateFee: goodLateFee }).some((f) => f.includes(CLAIM_FILE) && f.includes("no longer imports"))],
    ["raw-UTC site in policy-unit-fleet.service.ts is caught", check({ claim: goodClaim, fleet: regressedFleetSite, lateFee: goodLateFee }).some((f) => f.includes(FLEET_FILE) && f.includes("occurrence"))],
    ["missing import in policy-unit-fleet.service.ts is caught", check({ claim: goodClaim, fleet: regressedFleetImport, lateFee: goodLateFee }).some((f) => f.includes(FLEET_FILE) && f.includes("no longer imports"))],
    ["raw-UTC site in late-fee.service.ts is caught", check({ claim: goodClaim, fleet: goodFleet, lateFee: regressedLateFeeSite }).some((f) => f.includes(LATEFEE_FILE) && f.includes("occurrence"))],
    ["missing import in late-fee.service.ts is caught", check({ claim: goodClaim, fleet: goodFleet, lateFee: regressedLateFeeImport }).some((f) => f.includes(LATEFEE_FILE) && f.includes("no longer imports"))],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — insurance claim-recovery, fleet-premium, and late-fee dates use companyBusinessDate(), not raw UTC`);
}
