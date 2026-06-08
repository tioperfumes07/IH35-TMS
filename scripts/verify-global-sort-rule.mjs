#!/usr/bin/env node
/**
 * GLOBAL-SORT-RULE CI guard
 *
 * Locked rule (verbatim from docs/specs/GLOBAL-SORT-RULE.md):
 *   "Every column header in every list/catalog/bills/invoices/charts/categories/registers
 *    across the whole app sorts on click. First click = ascending (▲). Second click =
 *    descending (▼). QBO-style. No column header is ever non-sortable unless it is a pure
 *    action column (e.g., a delete button column). This applies to all list views powered
 *    by the shared ListView component (CA-02) and all existing DataTable/FleetTable/etc.
 *    components."
 *
 * Behavior:
 *   - WARN (exit 0) for non-compliant columns that predate the rule (before 2026-06-07).
 *   - FAIL (exit 1) if any column added AFTER 2026-06-07 lacks sortable=true / sortType.
 *   - Always prints a full compliance report.
 *
 * Patterns detected:
 *   1. DataTable / CatalogTable / RunnerTable style: `{ key: "...", label: "...", sortable?: boolean }`
 *      - Non-compliant: sortable: false OR sortable absent
 *   2. ListViewColumn style: `{ id: "...", label: "...", sortType?: SortType }`
 *      - Non-compliant: sortType absent (and not an action column)
 *
 * Action column exemption: columns whose key/id matches EXEMPT_COLUMN_KEYS are skipped.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND_SRC = path.join(ROOT, "apps/frontend/src");

/** Rule effective date — columns added after this date must be compliant or CI hard-fails. */
const RULE_DATE = new Date("2026-06-07T00:00:00Z");

/** Column keys/ids that are permanently exempt (pure action columns). */
const EXEMPT_COLUMN_KEYS = new Set([
  "actions",
  "action",
  "delete",
  "expand",
  "controls",
  "_actions",
  "row_actions",
]);

/** File globs to skip entirely. */
const SKIP_PATTERNS = [
  /node_modules/,
  /__tests__/,
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /demo\//,
  /MultiStopEditor\.tsx$/,   // uses @dnd-kit/sortable — unrelated "sortable" usage
];

function shouldSkipFile(relPath) {
  return SKIP_PATTERNS.some((p) => p.test(relPath));
}

// ---------------------------------------------------------------------------
// Git blame helpers
// ---------------------------------------------------------------------------

/** Returns the ISO date string of when the given line was last introduced. */
function getLineCommitDate(absPath, lineNumber) {
  try {
    const relPath = path.relative(ROOT, absPath);
    const output = execSync(
      `git -C "${ROOT}" log --follow -1 --format="%aI" -L ${lineNumber},${lineNumber}:"${relPath}" 2>/dev/null`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    // git log -L may output multiple lines; grab the first ISO timestamp
    const match = output.match(/\d{4}-\d{2}-\d{2}T/);
    if (match) {
      return new Date(output.split("\n").find((l) => l.match(/^\d{4}/)) || "");
    }
    return null;
  } catch {
    return null;
  }
}

function isNewColumn(absPath, lineNumber) {
  const date = getLineCommitDate(absPath, lineNumber);
  if (!date || isNaN(date.getTime())) return false;
  return date > RULE_DATE;
}

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Pattern 1 — DataTable / CatalogTable / RunnerTable style columns.
 *
 * Matches inline object literals with `key: "..."` and optionally `sortable`.
 * Example: { key: "description", label: "Description", sortable: false }
 * Example: { key: "status", label: "Status" }   ← missing sortable
 *
 * We match lines that contain `key:` + a string value because column definition
 * objects in this codebase always have key+label on the same conceptual row
 * (they're written as single-line objects in practice).
 */
const RE_DATATABLE_COL_EXPLICIT_FALSE =
  /\bkey\s*:\s*["']([^"']+)["'].*\bsortable\s*:\s*false/;

/**
 * Detects a DataTable-style column where `sortable` key is completely absent.
 * We look for lines that have `key: "..."` AND `label: "..."` but NO `sortable`.
 * This is the DataTable/CatalogTable/RunnerTable pattern.
 */
const RE_DATATABLE_COL_MISSING_SORTABLE =
  /\bkey\s*:\s*["']([^"']+)["'][^}]*\blabel\s*:\s*["']([^"']*?)["'][^}]*$/;

/**
 * Pattern 2 — ListViewColumn style (uses `id` + optional `sortType`).
 * Example: { id: "notes", label: "Notes", width: 200 }
 */
const RE_LISTVIEW_COL_MISSING_SORTTYPE =
  /\bid\s*:\s*["']([^"']+)["'][^}]*\blabel\s*:\s*["']([^"']*?)["'][^}]*$/;

/**
 * Files that use ListViewColumn pattern (id + sortType).
 * We identify these by checking if they import ListViewColumn.
 */
function usesListViewColumns(source) {
  return source.includes("ListViewColumn");
}

/**
 * Files that use DataTable-style columns (key + sortable).
 * Almost every file in the frontend may define columns this way — we scan all.
 */
function usesDataTableColumns(source) {
  return (
    source.includes("DataTable") ||
    source.includes("CatalogTable") ||
    source.includes("sortable") ||
    source.includes("ColumnConfig") ||
    source.includes("runner-config") ||
    // useCatalogQuery defines column objects inline
    source.includes("useCatalogQuery")
  );
}

function extractKeyFromMatch(m, group = 1) {
  return m[group] ?? "unknown";
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

const findings = {
  compliant: [],      // { file, line, key, label, reason }
  nonCompliant: [],   // { file, line, key, label, violation, isNew }
};

const files = walk(FRONTEND_SRC);

for (const absPath of files) {
  const relPath = path.relative(ROOT, absPath);
  if (shouldSkipFile(relPath)) continue;

  const source = fs.readFileSync(absPath, "utf8");
  const lines = source.split("\n");

  const isListView = usesListViewColumns(source);
  const isDataTable = usesDataTableColumns(source);

  if (!isListView && !isDataTable) continue;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // -------------------------------------------------------------------
    // Pattern 1a: DataTable column with explicit sortable: false
    // -------------------------------------------------------------------
    if (RE_DATATABLE_COL_EXPLICIT_FALSE.test(line)) {
      const m = line.match(RE_DATATABLE_COL_EXPLICIT_FALSE);
      const key = extractKeyFromMatch(m);
      if (EXEMPT_COLUMN_KEYS.has(key)) continue;

      const lineNew = isNewColumn(absPath, lineNumber);
      findings.nonCompliant.push({
        file: relPath,
        line: lineNumber,
        key,
        label: extractLabel(line),
        violation: "sortable: false",
        isNew: lineNew,
      });
      continue;
    }

    // -------------------------------------------------------------------
    // Pattern 1b: DataTable column with sortable absent
    // We only flag single-line column objects (key+label on same line, no sortable)
    // -------------------------------------------------------------------
    if (
      isDataTable &&
      RE_DATATABLE_COL_MISSING_SORTABLE.test(line) &&
      !line.includes("sortable") &&
      !line.includes("sortType") &&
      !line.includes("//") // skip commented-out columns
    ) {
      const m = line.match(RE_DATATABLE_COL_MISSING_SORTABLE);
      const key = extractKeyFromMatch(m);
      if (EXEMPT_COLUMN_KEYS.has(key)) continue;

      // Skip if this doesn't look like a table column (e.g., form field objects)
      // Form field objects tend to have `type:` key; table columns don't usually.
      if (line.includes('"type"') || /\btype\s*:\s*["'](?:text|number|select|date|boolean|textarea)["']/.test(line)) {
        continue;
      }

      const lineNew = isNewColumn(absPath, lineNumber);
      findings.nonCompliant.push({
        file: relPath,
        line: lineNumber,
        key,
        label: extractKeyFromMatch(m, 2),
        violation: "sortable absent",
        isNew: lineNew,
      });
      continue;
    }

    // -------------------------------------------------------------------
    // Pattern 2: ListViewColumn with sortType absent (id + label, no sortType)
    // -------------------------------------------------------------------
    if (
      isListView &&
      RE_LISTVIEW_COL_MISSING_SORTTYPE.test(line) &&
      !line.includes("sortType") &&
      !line.includes("sortable") &&
      !line.includes("//")
    ) {
      const m = line.match(RE_LISTVIEW_COL_MISSING_SORTTYPE);
      const id = extractKeyFromMatch(m);
      if (EXEMPT_COLUMN_KEYS.has(id)) continue;

      const lineNew = isNewColumn(absPath, lineNumber);
      findings.nonCompliant.push({
        file: relPath,
        line: lineNumber,
        key: id,
        label: extractKeyFromMatch(m, 2),
        violation: "sortType absent (ListViewColumn)",
        isNew: lineNew,
      });
    }
  }
}

function extractLabel(line) {
  const m = line.match(/\blabel\s*:\s*["']([^"']*?)["']/);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// Compliant summary — count files/columns that ARE compliant
// ---------------------------------------------------------------------------
const compliantFiles = new Set();
for (const absPath of files) {
  const relPath = path.relative(ROOT, absPath);
  if (shouldSkipFile(relPath)) continue;
  const source = fs.readFileSync(absPath, "utf8");
  if (/sortable\s*:\s*true/.test(source) || /sortType\s*:\s*["']/.test(source)) {
    compliantFiles.add(relPath);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const SEPARATOR = "─".repeat(72);
const RULE_LOCK_DATE = "2026-06-07";

console.log(`\n${SEPARATOR}`);
console.log(`  GLOBAL SORT RULE — Compliance Report`);
console.log(`  Rule effective: ${RULE_LOCK_DATE}  |  Scan: apps/frontend/src/`);
console.log(SEPARATOR);

// Compliant files summary
console.log(`\n✅  COMPLIANT FILES (have sortable: true or sortType)`);
for (const f of [...compliantFiles].sort()) {
  console.log(`   ${f}`);
}

// Non-compliant details
const preRule = findings.nonCompliant.filter((f) => !f.isNew);
const postRule = findings.nonCompliant.filter((f) => f.isNew);

if (findings.nonCompliant.length === 0) {
  console.log(`\n✅  No non-compliant columns found.\n`);
} else {
  if (preRule.length > 0) {
    console.log(`\n⚠️   NON-COMPLIANT (pre-rule, warn-only) — ${preRule.length} column(s)`);
    for (const f of preRule) {
      console.log(`   WARN  ${f.file}:${f.line}  key="${f.key}"  label="${f.label}"  [${f.violation}]`);
    }
  }

  if (postRule.length > 0) {
    console.log(`\n🚨  NON-COMPLIANT (post-rule, HARD FAIL) — ${postRule.length} column(s)`);
    for (const f of postRule) {
      console.log(`   FAIL  ${f.file}:${f.line}  key="${f.key}"  label="${f.label}"  [${f.violation}]`);
    }
  }
}

console.log(`\n${SEPARATOR}`);
console.log(`  Total non-compliant: ${findings.nonCompliant.length}  (${preRule.length} warn, ${postRule.length} fail)`);
console.log(`  Compliant file count: ${compliantFiles.size}`);
console.log(SEPARATOR);

if (postRule.length > 0) {
  console.error(
    `\nverify:global-sort-rule FAILED — ${postRule.length} column(s) added after ${RULE_LOCK_DATE} ` +
      `without sortable: true (or sortType for ListViewColumn). See report above.\n`
  );
  process.exit(1);
}

if (preRule.length > 0) {
  console.log(
    `\nverify:global-sort-rule PASSED with warnings — ${preRule.length} pre-rule non-compliant ` +
      `column(s) found. These must be remediated in a follow-up pass.\n`
  );
} else {
  console.log(`\nverify:global-sort-rule PASSED — all columns are compliant.\n`);
}

process.exit(0);
