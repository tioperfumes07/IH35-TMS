#!/usr/bin/env node
/**
 * ACCT-F06 / ACCT-ECON-05 — product vendor readers (autocomplete, Samsara mapping, WO)
 * must SELECT canonical mdata.qbo_vendors, never RETIRE accounting.qbo_vendors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-f06-vendor-product-readers";
const TARGETS = [
  "apps/backend/src/mdata/qbo-autocomplete.routes.ts",
  "apps/backend/src/integrations/samsara/vendor-mapping.routes.ts",
  "apps/backend/src/integrations/samsara/vendor-mapping-actions.routes.ts",
  "apps/backend/src/maintenance/work-orders.routes.ts",
  "apps/backend/src/work-orders/work-orders.routes.ts",
  "apps/backend/src/maintenance/reports.routes.ts",
];

/**
 * Heavy CI peel — re-pointed, same rule (readers use the canonical vendor table, never RETIRE accounting.qbo_vendors):
 * 300b098fa0 (#26733, LEAD 443.138 9c — master-data-native, no QBO mirror reads in money paths) moved the work-order
 * vendor validation in work-orders/work-orders.routes.ts to mdata.vendors (USMCA has no QBO mirror). For the files 9c
 * moved, the canonical table is mdata.vendors and the mirror is refused; the others keep mdata.qbo_vendors.
 */
const NATIVE_VENDOR_MASTER = new Set(["apps/backend/src/work-orders/work-orders.routes.ts"]);

export function assertCanonicalReader(source, filename) {
  const problems = [];
  if (source.includes("accounting.qbo_vendors")) {
    problems.push(`${filename}: must not SELECT RETIRE accounting.qbo_vendors`);
  }
  if (NATIVE_VENDOR_MASTER.has(filename)) {
    if (source.includes("mdata.qbo_vendors")) problems.push(`${filename}: reads the QBO vendor mirror — the canonical vendor master is mdata.vendors (443.138 9c)`);
    if (!/\bmdata\.vendors\b/.test(source)) problems.push(`${filename}: must SELECT canonical mdata.vendors`);
  } else if (!source.includes("mdata.qbo_vendors")) {
    problems.push(`${filename}: must SELECT canonical mdata.qbo_vendors`);
  }
  return problems;
}

function main() {
  const problems = TARGETS.flatMap((filename) =>
    assertCanonicalReader(fs.readFileSync(path.join(ROOT, filename), "utf8"), filename)
  );
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — product vendor readers target the canonical vendor table (mdata.vendors for 443.138 9c files, else mdata.qbo_vendors)`);
}

function selftest() {
  const failures = [];
  const bad = assertCanonicalReader("FROM accounting.qbo_vendors v", "fixture.ts");
  if (!bad.some((p) => p.includes("RETIRE"))) failures.push("did not catch RETIRE");
  const ok = assertCanonicalReader("FROM mdata.qbo_vendors v", "fixture.ts");
  if (ok.length) failures.push(`false positive: ${ok.join("; ")}`);
  const nativeFile = "apps/backend/src/work-orders/work-orders.routes.ts";
  if (assertCanonicalReader("FROM mdata.vendors v", nativeFile).length) failures.push("native vendor master rejected");
  if (!assertCanonicalReader("FROM mdata.qbo_vendors v FROM mdata.vendors v", nativeFile).some((p) => p.includes("mirror"))) failures.push("did not catch the QBO mirror on a 9c native file");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
