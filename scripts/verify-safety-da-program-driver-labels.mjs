#!/usr/bin/env node
/**
 * GUARD 2176 — Safety D&A Program surfaces must not use UUID-slice EntityLink labels.
 * Program enrollments/tests + drug-program pool/clearinghouse join mdata.drivers for driver_name.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-da-program-driver-labels";

const FE = [
  "apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx",
  "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
];
const BE = [
  "apps/backend/src/safety/drug-alcohol/program.service.ts",
  "apps/backend/src/safety/drug-program.routes.ts",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  for (const rel of FE) {
    const src = sources?.[rel] ?? read(rel);
    if (/driver_uuid\.slice\(0,\s*8\)/.test(src) || /driver_id\)\.slice\(0,\s*8\)/.test(src) || /String\(.*driver_id.*\)\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${rel}: UUID-slice EntityLink label is forbidden — use driver_name`);
    }
    if (!/driver_name/.test(src)) {
      problems.push(`${rel}: must read driver_name for EntityLink label`);
    }
  }
  const program = sources?.[BE[0]] ?? read(BE[0]);
  if (!/AS driver_name/.test(program) || !/JOIN mdata\.drivers/.test(program)) {
    problems.push(`${BE[0]}: listEnrollments/listTestRecords must JOIN mdata.drivers AS driver_name`);
  }
  const drugProgram = sources?.[BE[1]] ?? read(BE[1]);
  if (!/AS driver_name/.test(drugProgram) || !/JOIN mdata\.drivers/.test(drugProgram)) {
    problems.push(`${BE[1]}: drug-program list queries must JOIN mdata.drivers AS driver_name`);
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
  const plantedSrc = live[FE[0]] + '\nlabel={enrollment.driver_uuid.slice(0, 8) + "…"}\n';
  const planted = assert({ ...live, [FE[0]]: plantedSrc });
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
console.log(`${LABEL} PASS — D&A program + drug-program join driver_name; UI forbids UUID-slice labels`);
