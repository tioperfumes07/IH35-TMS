#!/usr/bin/env node
/**
 * GUARD 2170 — HOS dashboard + Training/DrugAlcohol tables must drill driver via EntityLink,
 * never raw UUID text (SAF-F14 / linkage law).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-hos-dashboard-driver-entitylink";
const TARGETS = [
  "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
  "apps/frontend/src/pages/safety/components/TrainingTable.tsx",
  "apps/frontend/src/pages/safety/components/DrugAlcoholTable.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertDriverEntityLinks(sources) {
  const problems = [];
  for (const rel of TARGETS) {
    const src = sources?.[rel] ?? read(rel);
    if (!/EntityLink/.test(src) || !/kind=["']driver["']/.test(src)) {
      problems.push(`${rel}: missing EntityLink kind="driver"`);
    }
    if (/Driver \{String\(row\.driver_id/.test(src) || /render: \(row\) => String\(row\.driver_id/.test(src)) {
      problems.push(`${rel}: raw driver_id string render still present`);
    }
  }
  const hos = sources?.[TARGETS[0]] ?? read(TARGETS[0]);
  if (!/render: \(row\) => <EntityLink kind="driver" id=\{row\.driverId\}/.test(hos) && !/id=\{row\.driverId\}/.test(hos)) {
    problems.push(`${TARGETS[0]}: fleet table must EntityLink row.driverId`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(TARGETS.map((t) => [t, read(t)]));
  const liveProblems = assertDriverEntityLinks(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const badHos = live[TARGETS[0]].replace(
    /<EntityLink[\s\S]*?id=\{row\.driverId\}[\s\S]*?\/>/,
    "{row.driverName}"
  );
  const planted = assertDriverEntityLinks({ ...live, [TARGETS[0]]: badHos });
  if (!planted.some((p) => p.includes("EntityLink") || p.includes("fleet"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted fleet defect not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertDriverEntityLinks();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — HOS dashboard + Training + DrugAlcohol use EntityLink kind=driver`);
