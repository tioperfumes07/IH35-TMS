#!/usr/bin/env node
/**
 * ACCT-ECON-05 Wave — Accounting/Lists vendor master READS must use the canonical vendor master
 * (mdata.vendors since 443.138 9c; never RETIRE accounting.qbo_vendors).
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

/**
 * Heavy CI peel — re-pointed, same rule (vendor master reads use the CANONICAL vendor table, never the RETIRE mirror),
 * stricter: 300b098fa0 (#26733, LEAD 443.138 9c — master-data-native, no QBO mirror reads in money paths; enforced by
 * 18437-verify-no-qbo-mirror-reads-in-money-paths) made mdata.vendors the canonical vendor master for both files —
 * USMCA has no QBO mirror, so the old mdata.qbo_vendors read always returned zero rows. Both files must read
 * mdata.vendors and may read neither QBO vendor mirror.
 */
export function assertMasterReads(src, rel) {
  const problems = [];
  if (/FROM\s+accounting\.qbo_vendors\b/i.test(src)) {
    problems.push(`${rel}: still SELECTs RETIRE accounting.qbo_vendors — use mdata.vendors`);
  }
  if (/FROM\s+mdata\.qbo_vendors\b/i.test(src)) {
    problems.push(`${rel}: reads the QBO vendor mirror mdata.qbo_vendors — the canonical vendor master is mdata.vendors (443.138 9c)`);
  }
  if (!/FROM\s+mdata\.vendors\b/i.test(src)) {
    problems.push(`${rel}: must SELECT FROM mdata.vendors`);
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
  console.log(`${LABEL} OK — qbo-master-read + names-master read the canonical mdata.vendors (no QBO vendor mirror)`);
}

function selftest() {
  const bad = assertMasterReads(`FROM accounting.qbo_vendors qv`, "x.ts");
  const mirror = assertMasterReads(`FROM mdata.qbo_vendors qv FROM mdata.vendors v`, "x.ts");
  const good = assertMasterReads(`FROM mdata.vendors v`, "x.ts");
  if (!bad.some((p) => /RETIRE/.test(p)) || !mirror.some((p) => /mirror/.test(p)) || good.length) {
    console.error(`${LABEL} --selftest FAIL`, { bad, good });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
