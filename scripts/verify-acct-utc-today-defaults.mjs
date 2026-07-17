#!/usr/bin/env node
/**
 * 0091-g6-1 regression guard — Accounting FE "today" / as-of / create-form date defaults must NOT
 * use the UTC clock. `new Date().toISOString().slice(0,10)` returns the UTC calendar date, so after
 * ~19:00 America/Chicago bill/invoice/JE/payment pickers and overdue KPIs roll to TOMORROW.
 *
 * Canonical fix: companyToday() from lib/businessDate (America/Chicago), matching backend
 * companyBusinessDate(). No new posting / GL math.
 *
 * Scans accounting FE surfaces and FAILS if the exact UTC-today anti-pattern reappears.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  "apps/frontend/src/pages/accounting",
  "apps/frontend/src/components/accounting",
  "apps/frontend/src/pages/lists/accounting",
];

const UTC_TODAY_RE = /new Date\(\)\.toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/;

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const violations = [];
for (const rel of SCAN_DIRS.flatMap(walk)) {
  const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (UTC_TODAY_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("[verify-acct-utc-today-defaults] FAILED — Accounting date defaults must use");
  console.error("companyToday() from lib/businessDate (America/Chicago), not UTC toISOString():");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("Fix: replace new Date().toISOString().slice(0, 10) with companyToday().");
  process.exit(1);
}

console.log("[verify-acct-utc-today-defaults] OK — no UTC-derived accounting 'today' defaults.");
