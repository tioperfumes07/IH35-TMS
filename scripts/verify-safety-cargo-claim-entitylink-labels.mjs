#!/usr/bin/env node
/**
 * GUARD 2184 — Cargo claim intake EntityLinks must not use UUID-slice fallback labels.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-cargo-claim-entitylink-labels";
const FE = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  if (!/EntityLink/.test(src) || !/kind=["']customer["']/.test(src) || !/kind=["']load["']/.test(src)) {
    problems.push(`${FE}: missing customer/load EntityLinks`);
  }
  if (/claimant_customer_id\)\.slice\(0,\s*8\)/.test(src) || /load_id\)\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FE}: UUID-slice EntityLink fallback is forbidden`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    [FE]: live[FE] + "\nlabel={String(row.load_id).slice(0, 8)}\n",
  });
  if (!planted.some((p) => p.includes("UUID-slice"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted slice not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — cargo claim EntityLinks forbid UUID-slice labels`);
