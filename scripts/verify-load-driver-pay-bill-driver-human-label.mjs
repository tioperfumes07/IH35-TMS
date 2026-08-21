#!/usr/bin/env node
/**
 * DISPATCH-DRIVER-PAY-BILL-DRIVER-HUMAN-LABEL-MISSING — the mounted Load Driver Pay tab reads
 * driver_id from GET /api/v1/driver-finance/driver-bills (load-scoped), but the producer's
 * `SELECT *` had no join to mdata.drivers, so no driver_name ever reached the payload and the
 * driver EntityLink rendered a hardcoded generic "Driver" label instead of the driver's real
 * name. Fixed with the SAME same-company LEFT JOIN pattern the sibling
 * /driver-finance/driver-bills/open route already used.
 *
 * Locks: (1) the load-scoped route joins mdata.drivers same-company and selects driver_name,
 * (2) the frontend type carries driver_name, (3) the driver EntityLink's label is resolved via
 * entityLabel(bill.driver_name, ...), never a hardcoded string.
 *
 * Run: node scripts/verify-load-driver-pay-bill-driver-human-label.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const routePath = "apps/backend/src/driver-finance/driver-bills.routes.ts";
const componentPath = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";

const routeSrc = readFileSync(routePath, "utf8");
const componentSrc = readFileSync(componentPath, "utf8");

function analyze(routeSrc, componentSrc) {
  const failures = [];

  // Scope to the load-scoped GET (the one this finding is about) rather than the whole file, so a
  // regression in the /open route's own join (a different, already-correct query) isn't conflated.
  const loadScopedStart = routeSrc.indexOf("FROM driver_finance.driver_bills db");
  const loadScopedSection = loadScopedStart === -1 ? "" : routeSrc.slice(Math.max(0, loadScopedStart - 400), loadScopedStart + 400);

  if (!/LEFT JOIN mdata\.drivers d ON d\.id = db\.driver_id AND d\.operating_company_id = db\.operating_company_id/.test(loadScopedSection)) {
    failures.push(`${routePath}: load-scoped driver-bills query no longer LEFT JOINs mdata.drivers same-company`);
  }
  if (!/concat_ws\(' ', d\.first_name, d\.last_name\) AS driver_name/.test(loadScopedSection)) {
    failures.push(`${routePath}: load-scoped driver-bills query no longer selects driver_name`);
  }

  if (!/driver_name\?:\s*string \| null/.test(componentSrc)) {
    failures.push(`${componentPath}: DriverBillRow no longer declares driver_name`);
  }
  if (!/label=\{entityLabel\(bill\.driver_name, bill\.driver_id, "Driver"\)\}/.test(componentSrc)) {
    failures.push(`${componentPath}: driver EntityLink no longer resolves its label via entityLabel(bill.driver_name, ...) — may have reverted to a hardcoded "Driver" string`);
  }
  if (/label="Driver"/.test(componentSrc)) {
    failures.push(`${componentPath}: found a hardcoded label="Driver" — the generic-label regression this finding is about`);
  }

  return failures;
}

function selftest() {
  const good = analyze(routeSrc, componentSrc);
  if (good.length > 0) {
    console.error("verify-load-driver-pay-bill-driver-human-label --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: revert the backend join (simulate the original SELECT * with no join).
  const mutatedRoute = routeSrc.replace(
    /SELECT\s+db\.\*,\s*\n\s*concat_ws\('\s',\s*d\.first_name,\s*d\.last_name\) AS driver_name\s*\n\s*FROM driver_finance\.driver_bills db\s*\n\s*LEFT JOIN mdata\.drivers d ON d\.id = db\.driver_id AND d\.operating_company_id = db\.operating_company_id/,
    "SELECT *\n          FROM driver_finance.driver_bills"
  );
  if (mutatedRoute === routeSrc) {
    console.error("verify-load-driver-pay-bill-driver-human-label --selftest: mutation 1 setup failed — anchor not found");
    process.exit(1);
  }
  const failures1 = analyze(mutatedRoute, componentSrc);
  if (failures1.length === 0) {
    console.error("verify-load-driver-pay-bill-driver-human-label --selftest: mutation 1 (drop backend join) was not caught");
    process.exit(1);
  }

  // Mutation 2: revert the frontend label back to a hardcoded string.
  const mutatedComponent = componentSrc.replace(
    'label={entityLabel(bill.driver_name, bill.driver_id, "Driver")}',
    'label="Driver"'
  );
  if (mutatedComponent === componentSrc) {
    console.error("verify-load-driver-pay-bill-driver-human-label --selftest: mutation 2 setup failed — anchor not found");
    process.exit(1);
  }
  const failures2 = analyze(routeSrc, mutatedComponent);
  if (failures2.length === 0) {
    console.error("verify-load-driver-pay-bill-driver-human-label --selftest: mutation 2 (revert to hardcoded label) was not caught");
    process.exit(1);
  }

  console.log("verify-load-driver-pay-bill-driver-human-label --selftest: OK (good files clean, both targeted mutations caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(routeSrc, componentSrc);
  if (failures.length > 0) {
    console.error("verify-load-driver-pay-bill-driver-human-label: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-load-driver-pay-bill-driver-human-label: OK — load-scoped driver-bills query joins mdata.drivers same-company, driver_name typed and resolved via entityLabel");
}
