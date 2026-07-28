#!/usr/bin/env node
/**
 * ACCT-ECON-05 Wave — Accounting/Lists vendor master READS must use canonical
 * accounting.qbo_vendors (not RETIRE mdata.qbo_vendors).
 *
 * Pins:
 *   - apps/backend/src/accounting/qbo-master-read.routes.ts
 *   - apps/backend/src/lists/names-master.routes.ts
 *
 * Usage: node scripts/verify-acct-econ-05-qbo-vendor-master-reads.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-econ-05-qbo-vendor-master-reads";
const FILES = [
  "apps/backend/src/accounting/qbo-master-read.routes.ts",
  "apps/backend/src/lists/names-master.routes.ts",
];

export function assertMasterReads(src, rel) {
  const problems = [];
  if (/FROM\s+mdata\.qbo_vendors\b/i.test(src)) {
    problems.push(`${rel}: still SELECTs RETIRE mdata.qbo_vendors — use accounting.qbo_vendors`);
  }
  if (!/FROM\s+accounting\.qbo_vendors\b/i.test(src)) {
    problems.push(`${rel}: must SELECT FROM accounting.qbo_vendors`);
  }
  return problems;
}

function main() {
  const problems = [];
  for (const rel of FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    problems.push(...assertMasterReads(src, rel));
  }
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — qbo-master-read + names-master read accounting.qbo_vendors`);
}

function selftest() {
  const bad = assertMasterReads(`FROM mdata.qbo_vendors qv`, "x.ts");
  const good = assertMasterReads(`FROM accounting.qbo_vendors qv`, "x.ts");
  if (!bad.some((p) => /RETIRE/.test(p)) || good.length) {
    console.error(`${LABEL} --selftest FAIL`, { bad, good });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
