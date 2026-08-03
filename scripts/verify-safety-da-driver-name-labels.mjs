#!/usr/bin/env node
/**
 * GUARD 2174 — Drug & Alcohol compliance surfaces must not use UUID-slice EntityLink labels.
 * Pool / RTD / results APIs join mdata.drivers for driver_name; UI prefers that label.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-da-driver-name-labels";

const FE = [
  "apps/frontend/src/pages/safety/RandomTestingPool.tsx",
  "apps/frontend/src/pages/safety/ReturnToDuty.tsx",
];
const BE = [
  "apps/backend/src/compliance/drug-alcohol-pool.ts",
  "apps/backend/src/compliance/drug-alcohol-results.ts",
  "apps/backend/src/compliance/drug-alcohol.routes.ts",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  for (const rel of FE) {
    const src = sources?.[rel] ?? read(rel);
    if (/driver_id\)\.slice\(0,\s*8\)/.test(src) || /String\(.*driver_id.*\)\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${rel}: UUID-slice EntityLink label is forbidden — use driver_name`);
    }
    if (!/driver_name/.test(src)) {
      problems.push(`${rel}: must read driver_name for EntityLink label`);
    }
  }
  const pool = sources?.[BE[0]] ?? read(BE[0]);
  if (!/AS driver_name/.test(pool) || !/JOIN mdata\.drivers/.test(pool)) {
    problems.push(`${BE[0]}: listActivePoolMembers must JOIN mdata.drivers AS driver_name`);
  }
  const rtd = sources?.[BE[1]] ?? read(BE[1]);
  if (!/AS driver_name/.test(rtd) || !/JOIN mdata\.drivers/.test(rtd)) {
    problems.push(`${BE[1]}: listOpenRtdProcesses must JOIN mdata.drivers AS driver_name`);
  }
  const routes = sources?.[BE[2]] ?? read(BE[2]);
  if (!/AS driver_name/.test(routes)) {
    problems.push(`${BE[2]}: draws/results queries must select driver_name`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries([...FE, ...BE].map((r) => [r, read(r)]));
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const badFe = live[FE[0]].replace(/driver_name/g, "driver_id").replace(
    /label=\{\(member\.driver_name[\s\S]*?\}/,
    'label={String(member.driver_id).slice(0, 8) + "…"}'
  );
  // Simpler plant: inject slice pattern
  const plantedSrc = live[FE[0]] + '\nlabel={String(x.driver_id).slice(0, 8)}\n';
  const planted = assert({ ...live, [FE[0]]: plantedSrc });
  if (!planted.some((p) => p.includes("UUID-slice"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted slice not caught`, planted);
    process.exit(1);
  }
  void badFe;
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — D&A pool/RTD/results join driver_name; UI forbids UUID-slice labels`);
