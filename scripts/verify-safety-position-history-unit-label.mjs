#!/usr/bin/env node
/**
 * GUARD 2194 — Position History unit EntityLink must not fall back to unit_id UUID.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-position-history-unit-label";
const FE = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  if (/label=\{row\.unit_number \?\? row\.unit_id\}/.test(src)) {
    problems.push(`${FE}: unit EntityLink must not fall back to unit_id UUID`);
  }
  if (!/label=\{row\.unit_number\?\.trim\(\) \|\| "Unit"\}/.test(src)) {
    problems.push(`${FE}: unit EntityLink must use unit_number or word Unit`);
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
    [FE]: live[FE].replace(/label=\{row\.unit_number\?\.trim\(\) \|\| "Unit"\}/, "label={row.unit_number ?? row.unit_id}"),
  });
  if (!planted.some((p) => p.includes("UUID"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted UUID fallback not caught`, planted);
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
console.log(`${LABEL} PASS — Position History unit labels forbid UUID fallback`);
