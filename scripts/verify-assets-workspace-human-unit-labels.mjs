#!/usr/bin/env node
/** LST-F112 — AssetsWorkspacePage unit_number must not fall back to id.slice(0, 8). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/assets/AssetsWorkspacePage.tsx";
const LABEL = "verify-assets-workspace-human-unit-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/unit_number:\s*row\.unit_code\?\.trim\(\)\s*\|\|\s*row\.id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: unit_number still falls back to row.id.slice(0, 8)`);
  }
  if (/unit_number:[\s\S]{0,80}id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: unit_number mapping still uses id.slice`);
  }
  if (!/entityLabel\(row\.unit_code,\s*row\.id,\s*"Unit"\)/.test(src)) {
    problems.push(`${FILE}: unit_number must use entityLabel(unit_code, id, Unit)`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live.replace(
    /unit_number:\s*entityLabel\(row\.unit_code,\s*row\.id,\s*"Unit"\)/,
    "unit_number: row.unit_code?.trim() || row.id.slice(0, 8)",
  );
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
