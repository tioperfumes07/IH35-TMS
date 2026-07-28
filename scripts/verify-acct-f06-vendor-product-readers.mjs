#!/usr/bin/env node
/**
 * ACCT-F06 / ACCT-ECON-05 — product vendor readers (autocomplete, Samsara mapping, WO)
 * must SELECT canonical accounting.qbo_vendors, never RETIRE mdata.qbo_vendors.
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

export function assertCanonicalReader(source, filename) {
  const problems = [];
  if (source.includes("mdata.qbo_vendors")) {
    problems.push(`${filename}: must not SELECT RETIRE mdata.qbo_vendors`);
  }
  if (!source.includes("accounting.qbo_vendors")) {
    problems.push(`${filename}: must SELECT canonical accounting.qbo_vendors`);
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
  console.log(`${LABEL} OK — product vendor readers target accounting.qbo_vendors`);
}

function selftest() {
  const failures = [];
  const bad = assertCanonicalReader("FROM mdata.qbo_vendors v", "fixture.ts");
  if (!bad.some((p) => p.includes("RETIRE"))) failures.push("did not catch RETIRE");
  const ok = assertCanonicalReader("FROM accounting.qbo_vendors v", "fixture.ts");
  if (ok.length) failures.push(`false positive: ${ok.join("; ")}`);
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
