#!/usr/bin/env node
/**
 * SafetyMeetingsPage + TrainingProgramsPage driver rosters must use EntityPicker
 * (kind=driver), not Combobox/listDrivers limit:200 pages. Cursor even claim: 2412.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-meetings-training-entity-pickers";
const TARGETS = [
  "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
];
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src, target) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker/.test(src) || !/kind=["']driver["']/.test(code)) {
    problems.push(`${target}: driver must use EntityPicker kind=driver`);
  }
  if (/listDrivers\(/.test(code)) {
    problems.push(`${target}: must not local-fetch driver roster — EntityPicker owns search`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `listDrivers({ limit: 200 })\n<input type="search" />`;
  const good = `<EntityPicker kind="driver" onChange={add} />`;
  const badP = collectProblems(bad, "stub.tsx");
  const goodP = collectProblems(good, "stub.tsx");
  if (badP.length < 2 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const problems = [];
for (const target of TARGETS) {
  const abs = path.join(ROOT, target);
  const src = fs.readFileSync(abs, "utf8");
  problems.push(...collectProblems(src, target));
}
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Safety meetings + training use EntityPicker kind=driver`);
