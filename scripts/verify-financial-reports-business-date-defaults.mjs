#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["reports","connectivity"],"leaves":["reports.financial.asof_default.business_date"],"task":"RPT-MONEY-F6972-FINANCIAL-UI-DATE-DEFAULTS-USE-UTC","vertical":"column-wave"} */
/**
 * RPT-MONEY-F6972-FINANCIAL-UI-DATE-DEFAULTS-USE-UTC (GO-0027 drain, CC-1, 2026-08-28): six
 * financial report/form surfaces derived their default "as of" date from
 * `new Date().toISOString().slice(0, 10)` -- UTC's calendar date -- instead of the canonical
 * frontend companyToday() helper (apps/frontend/src/lib/businessDate.ts, already used by
 * CustomerDetail.tsx, Customers.tsx, DriverDetail.tsx, AccountingHubPage.tsx and others). After
 * ~19:00 Central this defaults AP/AR aging, the balance sheet, and both cash-flow surfaces to
 * "as of tomorrow" until the user manually picks a date -- a genuinely wrong default on a
 * financial report, the same UTC-vs-company-timezone bug class this session already fixed on the
 * backend GL-posting side (DRV-MONEY-F6959, CUST-MONEY-F6964, MAINT-MONEY-F6956/F6971,
 * INS-MONEY-F6965).
 *
 * This guard asserts, against the REAL files, that each of the 6 named surfaces uses
 * companyToday() (not the raw UTC pattern) for its default as-of date, and imports it from
 * "../../lib/businessDate".
 *
 * Self-test: node scripts/verify-financial-reports-business-date-defaults.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-financial-reports-business-date-defaults";
const FILES = {
  ap: "apps/frontend/src/pages/reports/APAgingPage.tsx",
  ar: "apps/frontend/src/pages/reports/ARAgingPage.tsx",
  bs: "apps/frontend/src/pages/reports/BalanceSheetPage.tsx",
  cfOverview: "apps/frontend/src/pages/reports/CashFlowOverviewPage.tsx",
  cfReport: "apps/frontend/src/pages/reports/CashFlowReport.tsx",
  vendorAp: "apps/frontend/src/pages/vendors/VendorApAgingSection.tsx",
};
const BAD_PATTERN = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/;
const IMPORT_PATTERN = /import\s*\{\s*companyToday\s*\}\s*from\s*"\.\.\/\.\.\/lib\/businessDate"/;

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(sources) {
  const failures = [];
  const get = (key) => (sources ? sources[key] : (() => { try { return readReal(FILES[key]); } catch { return null; } })());
  for (const key of Object.keys(FILES)) {
    const src = get(key);
    if (src == null) {
      failures.push(`${FILES[key]} not found`);
      continue;
    }
    if (BAD_PATTERN.test(src)) {
      const count = (src.match(new RegExp(BAD_PATTERN, "g")) ?? []).length;
      failures.push(`${FILES[key]}: ${count} occurrence(s) of the raw UTC date pattern still present`);
    }
    if (!IMPORT_PATTERN.test(src)) {
      failures.push(`${FILES[key]}: no longer imports companyToday`);
    }
  }
  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const good = 'import { companyToday } from "../../lib/businessDate";\n  const today = companyToday();\n';
  const goodSources = Object.fromEntries(Object.keys(FILES).map((k) => [k, good]));
  if (check(goodSources).length !== 0) {
    console.error(`${LABEL} --selftest FAIL: fully-fixed shape produced failures:`, check(goodSources));
    process.exit(1);
  }
  let mutations = 0;
  for (const key of Object.keys(FILES)) {
    const regressedSite = { ...goodSources, [key]: good.replace("const today = companyToday();", "const today = new Date().toISOString().slice(0, 10);") };
    const failuresSite = check(regressedSite);
    if (!failuresSite.some((f) => f.includes(FILES[key]) && f.includes("occurrence"))) {
      console.error(`${LABEL} --selftest FAIL: raw-UTC site regression in ${FILES[key]} was not caught`);
      process.exit(1);
    }
    mutations += 1;

    const regressedImport = { ...goodSources, [key]: good.replace('import { companyToday } from "../../lib/businessDate";\n  ', "") };
    const failuresImport = check(regressedImport);
    if (!failuresImport.some((f) => f.includes(FILES[key]) && f.includes("no longer imports"))) {
      console.error(`${LABEL} --selftest FAIL: missing-import regression in ${FILES[key]} was not caught`);
      process.exit(1);
    }
    mutations += 1;
  }
  if (check().length !== 0) {
    console.error(`${LABEL} --selftest FAIL: real repo files do not currently satisfy this guard:`, check());
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${mutations} mutations detected across ${Object.keys(FILES).length} files)`);
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
  console.log(`${LABEL} PASS — AP/AR aging, balance sheet, and both cash-flow report surfaces default their as-of date via companyToday(), not raw UTC`);
}
