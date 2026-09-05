#!/usr/bin/env node
/**
 * LFI-18/19 sort-law guard (owner 2026-09-05): every list/report column server-paginated + sortable.
 * Scans pages/lists/** and pages/reports/** for ParityTable/DataTable columns with a `label` but
 * no `sortable: true` — every labeled column must be sortable per the sort law.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function listTsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const listsDir = resolve(ROOT, "apps/frontend/src/pages/lists");
const reportsDir = resolve(ROOT, "apps/frontend/src/pages/reports");

const failures = [];
let totalColumns = 0;
let sortableColumns = 0;

for (const file of [...listTsxFiles(listsDir), ...listTsxFiles(reportsDir)]) {
  const src = readFileSync(file, "utf8");
  // Find ParityTable column definitions: { key: "...", label: "...", ... }
  // Match column objects that have a label but check if sortable is present
  const columnRegex = /\{\s*key:\s*["'`][^"'`]+["'`]\s*,\s*label:\s*["'`][^"'`]+["'`]/g;
  let match;
  while ((match = columnRegex.exec(src)) !== null) {
    // Find the closing brace for this column object
    const start = match.index;
    let depth = 0;
    let end = start;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++;
      if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    const colDef = src.slice(start, end + 1);
    totalColumns++;
    if (/sortable:\s*true/.test(colDef)) {
      sortableColumns++;
    } else {
      // Skip columns that are action-only (no label or label is "Actions" with render)
      const labelMatch = colDef.match(/label:\s*["'`]([^"'`]+)["'`]/);
      const label = labelMatch ? labelMatch[1] : "";
      if (label === "Actions" || label === "actions") continue;
      failures.push(`${file}: column "${label}" has no sortable: true`);
    }
  }
}

if (failures.length) {
  console.error(`FAIL verify-lists-reports-sort-law — ${failures.length} column(s) missing sortable:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`PASS verify-lists-reports-sort-law — ${sortableColumns}/${totalColumns} labeled columns in lists/reports are sortable (LFI-18/19)`);
