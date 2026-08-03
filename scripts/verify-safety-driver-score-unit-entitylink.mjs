#!/usr/bin/env node
/**
 * GUARD 2188 — Driver score harsh-event rows must EntityLink the unit when unit_id is present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-driver-score-unit-entitylink";
const FE = "apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  if (!/EntityLink/.test(src) || !/kind=["']unit["']/.test(src)) {
    problems.push(`${FE}: missing EntityLink kind="unit" on harsh events`);
  }
  if (/Unit\{" "\}\s*\{event\.unit_number \?\? "N\/A"\}/.test(src) || /Unit{" "}\s*\n\s*\{event\.unit_number/.test(src)) {
    problems.push(`${FE}: plain unit_number text without EntityLink is forbidden when unit_id exists`);
  }
  // Prefer detecting the old one-liner pattern
  if (/Unit\{" "\}\s*\n\s*\{event\.unit_number \?\? "N\/A"\} · lat/.test(src) || /Unit \{event\.unit_number \?\? "N\/A"\} · lat/.test(src)) {
    problems.push(`${FE}: unit must drill via EntityLink`);
  }
  if (!/event\.unit_id/.test(src)) {
    problems.push(`${FE}: must gate EntityLink on event.unit_id`);
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
    [FE]: live[FE].replace(/EntityLink[\s\S]*?\/>/, '{event.unit_number ?? "N/A"}'),
  });
  if (!planted.length) {
    console.error(`${LABEL} SELFTEST FAIL: planted plain unit not caught`, planted);
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
console.log(`${LABEL} PASS — driver score harsh events EntityLink units`);
