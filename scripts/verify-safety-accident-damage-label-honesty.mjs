#!/usr/bin/env node
/**
 * GUARD 2186 — Accidents list + damage evidence must not use UUID-slice / bare-id labels.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-accident-damage-label-honesty";
const TARGETS = [
  "apps/frontend/src/pages/safety/AccidentsPage.tsx",
  "apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const accidents = sources?.[TARGETS[0]] ?? read(TARGETS[0]);
  if (/driver_name as string \| undefined\) \?\? undefined/.test(accidents) || /unit_number as string \| undefined\) \?\? undefined/.test(accidents)) {
    problems.push(`${TARGETS[0]}: EntityLink must fallback to stable words, not undefined (UUID text)`);
  }
  if (!/\|\| "Driver"/.test(accidents) || !/\|\| "Unit"/.test(accidents)) {
    problems.push(`${TARGETS[0]}: Driver/Unit EntityLinks need word fallbacks`);
  }
  const damage = sources?.[TARGETS[1]] ?? read(TARGETS[1]);
  if (/photo\.id\.slice\(0,\s*8\)/.test(damage)) {
    problems.push(`${TARGETS[1]}: Evidence label must not slice photo UUID`);
  }
  if (!/Evidence \{index \+ 1\}/.test(damage) && !/Evidence \{index\+1\}/.test(damage)) {
    problems.push(`${TARGETS[1]}: Evidence label must use ordinal index`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(TARGETS.map((t) => [t, read(t)]));
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    ...live,
    [TARGETS[1]]: live[TARGETS[1]] + "\nEvidence {photo.id.slice(0, 8)}\n",
  });
  if (!planted.some((p) => p.includes("photo UUID"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted UUID slice not caught`, planted);
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
console.log(`${LABEL} PASS — accidents EntityLink word fallbacks + damage evidence ordinals`);
