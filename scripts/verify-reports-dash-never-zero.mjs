#!/usr/bin/env node
/**
 * K.8 design law guard (owner 2026-09-05): dash never zero/None on reports.
 * Every report page that has a local `money(cents)` helper must guard against
 * zero/null by returning "—" instead of "$0.00". The IFTA step pages must also
 * guard their `fmtNum` helpers.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const REPORTS_DIR = resolve(ROOT, "apps/frontend/src/pages/reports");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const failures = [];

// 1. Every report page with a money() helper must guard zero
const reportFiles = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
for (const file of reportFiles) {
  const src = readFileSync(join(REPORTS_DIR, file), "utf8");
  if (/function money\(cents: number\)/.test(src)) {
    if (!/function money\(cents: number\)[\s\S]*?if \(!cents\)/.test(src)) {
      failures.push(`${file}: money() helper must guard zero/null with "—" (design law: dash never zero/None)`);
    }
  }
}

// 2. IFTA step pages must guard fmtNum against zero
const iftaDir = resolve(REPORTS_DIR, "ifta");
const iftaFiles = readdirSync(iftaDir).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
for (const file of iftaFiles) {
  const src = readFileSync(join(iftaDir, file), "utf8");
  if (/function fmtNum\(/.test(src)) {
    if (!/function fmtNum\([\s\S]*?if \(!value\)/.test(src)) {
      failures.push(`ifta/${file}: fmtNum() must guard zero with "—" (design law: dash never zero/None)`);
    }
  }
}

if (failures.length) {
  console.error("FAIL verify-reports-dash-never-zero:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`PASS verify-reports-dash-never-zero — ${reportFiles.length + iftaFiles.length} report files checked, all guard zero/null with dash (K.8)`);
