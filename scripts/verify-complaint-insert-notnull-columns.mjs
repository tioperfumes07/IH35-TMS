#!/usr/bin/env node
/**
 * P1 LIVE 500 — the complaints INSERT must populate every NOT NULL column that has no default.
 *
 * `safety.complaints.complaint_date` is `date NOT NULL` with NO default (migration 0050). The v6.4 route
 * inserted `filed_at` and omitted `complaint_date` entirely, so EVERY create died with Postgres 23502
 * (`null value in column "complaint_date" ... violates not-null constraint`) — a 500 AFTER zod and
 * validateConsistency both passed, which is why it read as "the create path is broken" rather than a
 * payload problem. Live complaints sat at 0.
 *
 * Migration 0051 added `filed_at` and back-filled it FROM `complaint_date`: the new column superseded the
 * old one, but the NOT NULL was left behind with nothing writing it. Until a migration drops or defaults
 * that column, the INSERT must keep filling it.
 *
 *   node scripts/verify-complaint-insert-notnull-columns.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-complaint-insert-notnull-columns";
const ROUTE = "apps/backend/src/routes/safety/complaints.ts";

function assert(files) {
  const src = files[ROUTE] ?? "";
  const problems = [];
  const start = src.indexOf("INSERT INTO safety.complaints");
  if (start < 0) {
    problems.push(`${ROUTE}: could not locate the INSERT INTO safety.complaints block`);
    return problems;
  }
  const end = src.indexOf("RETURNING *", start);
  const insert = src.slice(start, end);
  const cols = insert.split("VALUES")[0] ?? "";
  const vals = insert.split("VALUES")[1] ?? "";

  if (!/complaint_date/.test(cols)) {
    problems.push(`${ROUTE}: INSERT omits complaint_date, which is NOT NULL with no default — every create 500s (Postgres 23502)`);
  }
  if (!/COALESCE\(\$2::timestamptz, now\(\)\)::date/.test(vals)) {
    problems.push(`${ROUTE}: complaint_date must be derived from the SAME $2 expression as filed_at, so the two cannot disagree`);
  }
  // Lockstep: a column added without its value silently shifts every later column.
  const colNames = cols
    .slice(cols.indexOf("(") + 1, cols.lastIndexOf(")"))
    .split("\n").map((l) => l.replace(/--.*$/, "")).join(" ")
    .split(",").map((c) => c.trim()).filter(Boolean);
  // Split at paren DEPTH 0 only. A naive comma split tears `COALESCE($2::timestamptz, now())` into two
  // slots — this INSERT has three COALESCE calls, so the naive count reported 22 slots against 19 columns
  // and would have failed a perfectly aligned statement. The guard must parse what it claims to check.
  const slotText = vals.slice(vals.indexOf("(") + 1, vals.lastIndexOf(")"));
  const slots = [];
  let depth = 0;
  let cur = "";
  for (const ch of slotText) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { slots.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) slots.push(cur.trim());
  if (colNames.length !== slots.length) {
    problems.push(`${ROUTE}: INSERT is MISALIGNED — ${colNames.length} columns vs ${slots.length} value slots`);
  }
  return problems;
}

const files = Object.fromEntries([ROUTE].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    // The comment block sits between the comma and the column, so target the bare column line itself.
    ["complaint_date column dropped", { [ROUTE]: files[ROUTE].replace(/\n +complaint_date\n(?= +\))/, "\n") }],
    ["complaint_date value dropped", { [ROUTE]: files[ROUTE].replace(/,\n\s*COALESCE\(\$2::timestamptz, now\(\)\)::date\n/, "\n") }],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — complaints INSERT fills complaint_date from the filed_at expression, columns and values aligned`);
process.exit(0);
