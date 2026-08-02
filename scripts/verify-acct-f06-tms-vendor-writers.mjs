#!/usr/bin/env node
/**
 * ACCT-F06 — all active TMS vendor create/push writers must use canonical
 * mdata.qbo_vendors, never RETIRE accounting.qbo_vendors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-f06-tms-vendor-writers";
const TARGETS = [
  "apps/backend/src/mdata/qbo-master-write.routes.ts",
  "apps/backend/src/outbox/handlers/tms-vendor-push.handler.ts",
  "apps/backend/src/qbo/push.service.ts",
];

export function assertCanonicalVendorWriter(source, filename) {
  const problems = [];
  if (source.includes("accounting.qbo_vendors")) {
    problems.push(`${filename}: must not read or write RETIRE accounting.qbo_vendors`);
  }
  if (!source.includes("mdata.qbo_vendors")) {
    problems.push(`${filename}: must read or write canonical mdata.qbo_vendors`);
  }
  return problems;
}

function main() {
  const problems = TARGETS.flatMap((filename) =>
    assertCanonicalVendorWriter(fs.readFileSync(path.join(ROOT, filename), "utf8"), filename)
  );
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — TMS vendor writers target mdata.qbo_vendors only`);
}

function selftest() {
  const failures = [];
  const retired = assertCanonicalVendorWriter(
    "INSERT INTO accounting.qbo_vendors (display_name) VALUES ($1)",
    "fixture.ts"
  );
  if (!retired.some((problem) => problem.includes("RETIRE"))) failures.push("did not catch RETIRE writer");

  const canonical = assertCanonicalVendorWriter(
    "UPDATE mdata.qbo_vendors SET active = true",
    "fixture.ts"
  );
  if (canonical.length) failures.push(`false positive: ${canonical.join("; ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
