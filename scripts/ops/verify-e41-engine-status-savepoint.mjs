#!/usr/bin/env node
/**
 * E-41 — engine-status probes must SAVEPOINT-isolate failures inside the board transaction.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-e41-engine-status-savepoint";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/system/engine-status.reads.ts";

function audit() {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const f = [];
  if (!/SAVEPOINT/.test(src)) f.push(`${FILE}: SAVEPOINT required around countLast24h probes`);
  if (!/ROLLBACK TO SAVEPOINT/.test(src)) f.push(`${FILE}: ROLLBACK TO SAVEPOINT required on probe failure`);
  if (!/async function countLast24h/.test(src)) f.push(`${FILE}: countLast24h missing`);
  if (!/RELEASE SAVEPOINT/.test(src)) f.push(`${FILE}: RELEASE SAVEPOINT on success required`);
  return f;
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL}${SELFTEST ? " SELFTEST" : ""} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}${SELFTEST ? " SELFTEST" : ""} PASS`);
process.exit(0);
