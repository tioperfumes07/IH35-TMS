#!/usr/bin/env node
/**
 * SAFETY-1 regression guard — Safety create/log forms must NOT default a business date/datetime
 * from the UTC clock. `new Date().toISOString()` (and `.slice(0,10)`) return the UTC instant, so after
 * ~19:00 America/Chicago the prefill rolls to TOMORROW. On a DOT compliance/audit record that files
 * the event under the wrong day (the HOS "occurred" field showed 06/30 01:24 AM at 8:23 PM CST 06/29).
 *
 * Canonical fix (PR #1674): default create-form dates via companyToday()/companyNow() from
 * lib/businessDate (America/Chicago wall-clock), never toISOString(). This guard locks that in: it
 * scans the Safety frontend surface and FAILS if a form DEFAULT re-introduces the UTC anti-pattern.
 *
 * Scope note: only DEFAULT contexts are flagged (defaultValue={...} and state-object field defaults
 * whose key is a date/datetime, e.g. `occurred_at:`/`report_date:`). `max=`/`min=` validation bounds
 * and read-only filter/range helpers are intentionally NOT flagged — they are not create-form defaults.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  "apps/frontend/src/pages/safety",
  "apps/frontend/src/components/safety",
];

// (a) create-form default value built from the UTC clock: defaultValue={ ... new Date() ... toISOString() ... }
const DEFAULT_VALUE_RE = /defaultValue=\{[^}]*\bnew Date\(\)[^}]*\.toISOString\(\)/;
// (b) state-object field default whose key is a date/datetime, e.g. occurred_at / report_date / accidentDate
const STATE_FIELD_RE = /\b\w*(?:_at|_date|[Dd]ate)\s*:\s*new Date\(\)\.toISOString\(\)/;

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
    if (DEFAULT_VALUE_RE.test(line) || STATE_FIELD_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("[verify-safety-form-date-defaults] FAILED — Safety create-form date defaults must use");
  console.error("companyToday()/companyNow() from lib/businessDate (America/Chicago), not the UTC clock:");
  for (const v of violations) console.error(`  - ${v}`);
  console.error("Fix: replace new Date().toISOString() defaults with companyToday() (date) or companyNow() (datetime-local).");
  process.exit(1);
}

console.log("[verify-safety-form-date-defaults] OK — no UTC-derived date/datetime defaults in Safety create-forms.");
