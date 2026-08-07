#!/usr/bin/env node
/**
 * GUARD 2192 — Fine convert confirm must not pass a raw driver UUID as driverLabel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-fine-convert-driver-label";
const FE = "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  if (/driverLabel=\{String\(fine\.subject_driver_name \?\? fine\.subject_driver_id/.test(src)) {
    problems.push(`${FE}: FineConvertConfirmModal must not fall back to subject_driver_id UUID`);
  }
  if (!/driverLabel=\{ \(fine\.subject_driver_name/.test(src) && !/driverLabel=\{\(fine\.subject_driver_name/.test(src)) {
    problems.push(`${FE}: driverLabel must prefer subject_driver_name with word fallback`);
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
    [FE]: live[FE] + '\ndriverLabel={String(fine.subject_driver_name ?? fine.subject_driver_id ?? "driver")}\n',
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
console.log(`${LABEL} PASS — fine convert modal uses driver name, not UUID`);
