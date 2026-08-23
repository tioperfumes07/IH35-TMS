#!/usr/bin/env node
/**
 * FORM425C-HISTORY-MONTH-UTC-SHIFT — History must label reporting_month from
 * the calendar YYYY-MM, never `new Date(timestamptz).toLocaleDateString()` in
 * local TZ. Live: TEST-425C-CURSOR-20260823 reporting_month 2026-08-01T00:00:00.000Z
 * rendered "July 2026" in America/Chicago.
 *
 * Self-test: node scripts/verify-form425c-history-month-utc.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-history-month-utc";
const TAB = "apps/frontend/src/pages/form425c/tabs/HistoryTab.tsx";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("function periodLabel(")) {
    problems.push(`${TAB}: missing periodLabel`);
  }
  if (/new Date\(value\)/.test(src) && /toLocaleDateString/.test(src)) {
    problems.push(`${TAB}: periodLabel must not use local Date#toLocaleDateString on reporting_month`);
  }
  if (!/slice\(0,\s*10\)/.test(src) || !/MONTH_NAMES/.test(src)) {
    problems.push(`${TAB}: periodLabel must map YYYY-MM from the ISO date prefix`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `function periodLabel(value: string) {
  const ymd = String(value).slice(0, 10);
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(ymd);
  return MONTH_NAMES[Number(match[2]) - 1] + " " + match[1];
}`;
  const bad = `function periodLabel(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}`;
  const g = collectProblems(good);
  const b = collectProblems(bad);
  if (g.length) {
    console.error(`${LABEL} --selftest FAIL good: ${g.join("; ")}`);
    process.exit(1);
  }
  if (!b.some((p) => p.includes("toLocaleDateString"))) {
    console.error(`${LABEL} --selftest FAIL: local Date label must fail`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const problems = collectProblems(fs.readFileSync(path.join(ROOT, TAB), "utf8"));
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — History month uses calendar YYYY-MM, not local TZ`);
process.exit(0);
