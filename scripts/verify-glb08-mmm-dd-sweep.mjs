#!/usr/bin/env node
/**
 * GLB-08 guard — verifies that lists/reports pages (excluding accounting/dispatch)
 * no longer use legacy date formatters (formatDateUS, formatDateTimeUS, toLocaleDateString,
 * toLocaleString, Intl.DateTimeFormat) for DISPLAY purposes.
 *
 * Allowed exclusions (internal, not user-facing display):
 *   - toISOString().slice(0, 10) — internal query params
 *   - DatePicker value props
 *   - CSV filename date strings
 *   - sort values
 *
 * Exits 0 if all clear, 1 if violations found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = new URL("..", import.meta.url).pathname;
const PAGES_DIR = join(REPO, "apps/frontend/src/pages");

const SCAN_DIRS = [
  join(PAGES_DIR, "lists"),
  join(PAGES_DIR, "reports"),
];

const EXCLUDE_DIRS = [
  join(PAGES_DIR, "lists/accounting"),
  join(PAGES_DIR, "lists/dispatch"),
];

// Patterns that indicate a date being rendered to the user (display).
// NOTE: `.toLocaleString()` is also used for NUMBER formatting (miles, points, etc.).
// We only flag it when called on a `new Date(...)` expression, which is the date-display case.
const DISPLAY_PATTERNS = [
  /\bformatDateUS\b/g,
  /\bformatDateTimeUS\b/g,
  /new\s+Date\s*\([^)]*\)\s*\.toLocaleDateString\s*\(/g,
  /new\s+Date\s*\([^)]*\)\s*\.toLocaleString\s*\(/g,
  /\bIntl\.DateTimeFormat\b/g,
];

// Also flag bare `.toLocaleDateString(` and `.toLocaleString(` when the variable
// name or surrounding context strongly suggests a date (e.g. `iso`, `occurred_at`,
// `computed_at`, `_at`, `_date`, `Date`, etc.). This catches cases where a date
// value is stored in a variable and then `.toLocaleString()` is called on it.
const DATE_CONTEXT_PATTERNS = [
  /\.toLocaleDateString\s*\(/g,
  /\.toLocaleString\s*\(/g,
];

// Variable/name patterns that suggest the value is a date (not a number).
const DATE_NAME_HINTS = [
  /_at\b/i, /_date\b/i, /\biso\b/i, /\bdate\b/i, /\bDate\b/,
  /\boccurred\b/i, /\bcomputed\b/i, /\baggregated\b/i, /\bcalculated\b/i,
  /\bsubmitted\b/i, /\bgenerated\b/i, /\bentered\b/i, /\bexited\b/i,
  /\bdueAt\b/i, /\blastRun\b/i, /\bnextRun\b/i, /\bsentAt\b/i,
];

// Lines that are clearly internal (not display) — skip them.
const INTERNAL_PATTERNS = [
  /toISOString\s*\(\s*\)\s*\.slice/i,   // internal query param
  /DatePicker/i,                          // picker value prop
  /\.download\s*=/i,                      // CSV filename assignment
  /exportFilename/i,                      // CSV export filename
  /sortValue/i,                           // sort comparator value
];

/**
 * Recursively collect .tsx files under a directory, excluding any path
 * that starts with one of EXCLUDE_DIRS.
 */
function collectTsxFiles(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectTsxFiles(full, acc);
    } else if (entry.endsWith(".tsx")) {
      if (EXCLUDE_DIRS.some((ex) => full.startsWith(ex))) continue;
      acc.push(full);
    }
  }
  return acc;
}

function isInternalLine(line) {
  return INTERNAL_PATTERNS.some((p) => p.test(line));
}

const files = [];
for (const d of SCAN_DIRS) {
  collectTsxFiles(d, files);
}

const violations = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isInternalLine(line)) continue;

    for (const pattern of DISPLAY_PATTERNS) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        // Skip import lines for formatDateUS/formatDateTimeUS — handled separately below.
        if (/^\s*import\s+/.test(line) && /from\s+["'].*formatDate["']/.test(line)) {
          if (/\bformatDateUS\b/.test(line) || /\bformatDateTimeUS\b/.test(line)) {
            violations.push({
              file: relative(REPO, file),
              line: i + 1,
              text: line.trim(),
              reason: "Legacy import of formatDateUS/formatDateTimeUS — remove if unused, or replace usages with mmmDd/mmmDdTime",
            });
          }
          continue;
        }
        violations.push({
          file: relative(REPO, file),
          line: i + 1,
          text: line.trim(),
          reason: `Non-MMM-DD date formatter detected: ${pattern.source}`,
        });
      }
    }

    // Check date-context patterns: .toLocaleString() / .toLocaleDateString()
    // only when the variable or surrounding context suggests a date value.
    for (const pattern of DATE_CONTEXT_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        // Skip if already flagged by a DISPLAY_PATTERN
        if (violations.some((v) => v.file === relative(REPO, file) && v.line === i + 1)) continue;
        // Skip import lines
        if (/^\s*import\s+/.test(line)) continue;
        // Skip if the line has no date-name hints (it's likely a number format)
        const hasDateHint = DATE_NAME_HINTS.some((h) => h.test(line));
        // Also flag if `new Date(` appears on the same line (already caught above, but double-check)
        if (!hasDateHint && !/new\s+Date\s*\(/.test(line)) continue;
        violations.push({
          file: relative(REPO, file),
          line: i + 1,
          text: line.trim(),
          reason: `Non-MMM-DD date formatter detected (date context): ${pattern.source}`,
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("GLB-08 sweep guard: all clear — no legacy date formatters found in lists/reports display.");
  process.exit(0);
} else {
  console.error(`GLB-08 sweep guard: ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.reason}\n`);
  }
  process.exit(1);
}
