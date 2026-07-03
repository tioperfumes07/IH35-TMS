#!/usr/bin/env node
/**
 * SYS-DATE CI guard (WAVE 1A / root date-format fix).
 *
 * The database/API format for dates is ISO 8601 "YYYY-MM-DD". That format must NEVER reach a user's
 * screen — every US-facing TMS/ERP/accounting system (QuickBooks, McLeod, Alvys, NetSuite) shows
 * MM/DD/YYYY. All date DISPLAY must route through `formatDateUS()` in apps/frontend/src/lib/formatDate.ts.
 *
 * This guard statically scans the frontend for the three ways a raw ISO date leaks into the UI and
 * fails CI (exit 1) on any new occurrence:
 *
 *   A) placeholder="YYYY-MM-DD"          — an ISO placeholder on a date field
 *   B) >{ expr.slice(0, 10) }<           — a JSX text node rendering the first 10 chars of an ISO
 *                                          timestamp (raw YYYY-MM-DD) instead of formatDateUS(expr)
 *   C) >2026-07-03<                       — a hardcoded ISO date literal in a JSX text node
 *
 * Regression lock: once WAVE 1A removes every occurrence, any reintroduction fails the build.
 *
 * Usage:
 *   node scripts/verify-no-iso-date-display.mjs            # CI gate
 *   node scripts/verify-no-iso-date-display.mjs --selftest # verify the guard catches a seeded leak
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps", "frontend", "src");

// A) ISO placeholder text (any quoting style: placeholder="YYYY-MM-DD" / placeholder={"YYYY-MM-DD"}).
const ISO_PLACEHOLDER = /placeholder\s*=\s*[{"'`]*\s*YYYY-MM-DD/;
// B) JSX text node rendering a .slice(0, 10) of a (date) value — raw ISO leak.
const JSX_SLICE_DATE = />\s*\{[^}]*\.slice\(\s*0\s*,\s*10\s*\)\s*\}\s*</;
// C) Hardcoded ISO date literal inside a JSX text node.
const JSX_ISO_LITERAL = />\s*\d{4}-\d{2}-\d{2}\s*</;

const CHECKS = [
  { re: ISO_PLACEHOLDER, label: 'ISO placeholder "YYYY-MM-DD" (use "MM/DD/YYYY")' },
  { re: JSX_SLICE_DATE, label: "raw {value.slice(0, 10)} in JSX (use formatDateUS(value))" },
  { re: JSX_ISO_LITERAL, label: "hardcoded YYYY-MM-DD literal in JSX text (use MM/DD/YYYY)" },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function scan(text) {
  const hits = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const { re, label } of CHECKS) {
      if (re.test(line)) hits.push({ line: i + 1, label, text: line.trim() });
    }
  });
  return hits;
}

if (process.argv.includes("--selftest")) {
  const fixtures = [
    '<input placeholder="YYYY-MM-DD" />',
    "<td>{row.created_at.slice(0, 10)}</td>",
    "<span>2026-07-03</span>",
  ];
  const clean = ['<input placeholder="MM/DD/YYYY" />', "<td>{formatDateUS(row.created_at)}</td>"];
  const badCaught = fixtures.every((f) => scan(f).length > 0);
  const cleanPasses = clean.every((f) => scan(f).length === 0);
  if (badCaught && cleanPasses) {
    console.log("verify-no-iso-date-display selftest: PASS");
    process.exit(0);
  }
  console.error("verify-no-iso-date-display selftest: FAIL", { badCaught, cleanPasses });
  process.exit(1);
}

const files = walk(SRC);
let total = 0;
for (const file of files) {
  const hits = scan(readFileSync(file, "utf8"));
  if (hits.length) {
    total += hits.length;
    const rel = relative(ROOT, file);
    for (const h of hits) {
      console.error(`${rel}:${h.line}  ${h.label}\n    ${h.text}`);
    }
  }
}

if (total > 0) {
  console.error(
    `\n✗ ${total} raw ISO (YYYY-MM-DD) date leak(s) in user-facing frontend text.\n` +
      "  Route all date display through formatDateUS() (apps/frontend/src/lib/formatDate.ts).",
  );
  process.exit(1);
}
console.log(`✓ verify-no-iso-date-display: no raw ISO date leaks across ${files.length} .tsx files.`);
