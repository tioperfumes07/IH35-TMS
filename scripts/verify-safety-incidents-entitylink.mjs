#!/usr/bin/env node
/**
 * SAF-F20 linkage — Damage/Trailer Interchange list + detail must drill via EntityLink
 * (driver/unit/load), not plain-text names or raw UUIDs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const LABEL = "verify-safety-incidents-entitylink";

export function collectProblems(src) {
  const problems = [];
  if (!/from ["'].*EntityLink["']/.test(src)) {
    problems.push(`${TARGET}: must import EntityLink`);
  }
  if (!/kind=\"driver\"/.test(src)) {
    problems.push(`${TARGET}: list Driver column must use EntityLink kind=\"driver\"`);
  }
  if (!/kind=\"unit\"/.test(src)) {
    problems.push(`${TARGET}: list Unit column must use EntityLink kind=\"unit\"`);
  }
  if (!/kind=\"load\"/.test(src)) {
    problems.push(`${TARGET}: detail Load must use EntityLink kind=\"load\"`);
  }
  // Forbid plain-name-only driver column (the pre-fix dead-end)
  if (/driverNameById\.get\([^)]+\)\s*\|\|\s*"—"/.test(src) && !/kind=\"driver\"/.test(src)) {
    problems.push(`${TARGET}: driver column still plain-text via driverNameById`);
  }
  if (/str\(detail\?\.load_id\)\s*\|\|\s*"—"/.test(src)) {
    problems.push(`${TARGET}: detail still renders raw load_id UUID`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const goodP = collectProblems(good);
  if (goodP.length) {
    console.error(`${LABEL} --selftest FAIL good:\n${goodP.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  const bad = good
    .replace(/kind=\"driver\"/g, 'kind="x"')
    .replace(/kind=\"unit\"/g, 'kind="y"')
    .replace(/kind=\"load\"/g, 'kind="z"');
  if (collectProblems(bad).length < 3) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const problems = collectProblems(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — incidents cluster drills driver/unit/load via EntityLink`);
}
