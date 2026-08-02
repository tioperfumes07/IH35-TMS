#!/usr/bin/env node
/**
 * ACCT-F06 / ACCT-ECON-05 — qbo-vendors push worker + Home status must use
 * canonical mdata.qbo_vendors, never RETIRE accounting.qbo_vendors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-f06-qbo-vendors-push";
const UNIT_TEST = "apps/backend/src/sync/__tests__/qbo-vendors-push.test.ts";

const TARGETS = [
  "apps/backend/src/sync/qbo-vendors-push.ts",
  "apps/backend/src/sync/qbo-vendors-status.routes.ts",
];

export function assertCanonicalPush(source, filename) {
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
  const problems = [...TARGETS, UNIT_TEST].flatMap((filename) =>
    assertCanonicalPush(fs.readFileSync(path.join(ROOT, filename), "utf8"), filename)
  );
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — qbo-vendors push + status target mdata.qbo_vendors only`);
}

function selftest() {
  const failures = [];
  const retired = assertCanonicalPush("UPDATE accounting.qbo_vendors SET sync_status = 'synced'", "fixture.ts");
  if (!retired.some((p) => p.includes("RETIRE"))) failures.push("did not catch RETIRE");
  const ok = assertCanonicalPush("UPDATE mdata.qbo_vendors SET sync_status = 'synced'", "fixture.ts");
  if (ok.length) failures.push(`false positive: ${ok.join("; ")}`);
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
