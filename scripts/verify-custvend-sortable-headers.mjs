#!/usr/bin/env node
/**
 * verify-custvend-sortable-headers.mjs — BANK-SORT-ROLLOUT-ACCT CI guard (Customers/Vendors/AP-Aging)
 *
 * Locks: every visible DATA column header on the Customers list (CustomersListView), Vendors list
 * (VendorsListView), and A/P Aging report (APAgingPage) is clickable ASC/DESC, and the sort state
 * is persisted in the URL (?sort=&dir=) via the shared `useUrlSort` hook + ParityTable's
 * controlled-sort props — same asc/desc-only header contract Bills/Expenses shipped
 * (verify-accounting-sortable-headers.mjs) and the Banking register shipped before that
 * (BANK-SORT-ROLLOUT).
 *
 * Checks, per page:
 *   - imports + calls useUrlSort()
 *   - wires its `sortKey` / `sortDirection` / `onSortChange` onto <ParityTable ... />
 *   - every DATA column (i.e. not a pure-action column, see EXEMPT_COLUMN_KEYS) has
 *     `sortable: true`
 *
 * Does NOT re-check apps/frontend/src/hooks/useUrlSort.ts or ParityTable.tsx's controlled-sort
 * contract itself — verify-accounting-sortable-headers.mjs already owns that shared-infra check;
 * duplicating it here would just be two guards racing to fail on the same root cause.
 *
 * Usage: node scripts/verify-custvend-sortable-headers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify-custvend-sortable-headers";

const HOOK_FILE = "apps/frontend/src/hooks/useUrlSort.ts";
const PAGES = [
  { file: "apps/frontend/src/pages/customers/CustomersListView.tsx", label: "Customers" },
  { file: "apps/frontend/src/pages/vendors/VendorsListView.tsx", label: "Vendors" },
  { file: "apps/frontend/src/pages/reports/APAgingPage.tsx", label: "A/P Aging" },
];

/** Pure action / non-data columns are exempt from the sortable-header rule (GLOBAL-SORT-RULE.md). */
const EXEMPT_COLUMN_KEYS = new Set(["actions", "action", "delete", "allocate", "expand", "controls"]);

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

/**
 * Isolates the actual `columns={[ ... ]}` (or `columns={someVar}` → whole-file fallback) region
 * of the source so unrelated `{ key: ..., label: ... }` literals elsewhere in the same file (e.g.
 * filter-chip arrays on Customers/Vendors, which reuse the word "key") aren't mistaken for
 * ParityColumn definitions.
 */
function extractColumnsRegion(source) {
  const inline = source.indexOf("columns={[");
  if (inline === -1) return source; // `columns={columnsVar}` — fall back to whole-file scan.
  let depth = 0;
  let end = inline;
  for (let i = inline; i < source.length; i++) {
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return source.slice(inline, end);
}

/**
 * Extracts `{ key: "...", ... }` column-literal blocks from a columns array/useMemo body and
 * reports which ones are missing `sortable: true`. Column objects in this codebase span
 * multiple lines, so we scan brace-balanced blocks starting at each `key:` occurrence rather
 * than matching single lines (unlike the single-line GLOBAL-SORT-RULE scan).
 */
function findNonSortableDataColumns(fullSource) {
  const source = extractColumnsRegion(fullSource);
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const key = match[1];
    // Walk forward to find the matching closing brace for this column object literal.
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = source.slice(start, end);
    if (EXEMPT_COLUMN_KEYS.has(key)) continue;
    if (!/sortable\s*:\s*true/.test(block)) {
      offenders.push(key);
    }
  }
  return offenders;
}

const failures = [];

// ---------------------------------------------------------------------------
// Shared useUrlSort hook must exist (owned/verified by verify-accounting-sortable-headers.mjs;
// this guard just needs it present to check the three pages below).
// ---------------------------------------------------------------------------
if (!fs.existsSync(path.join(ROOT, HOOK_FILE))) {
  failures.push(`${HOOK_FILE} — MISSING (required by Customers/Vendors/AP-Aging sort wiring)`);
}

// ---------------------------------------------------------------------------
// Customers / Vendors / A/P Aging pages
// ---------------------------------------------------------------------------
for (const { file, label } of PAGES) {
  const src = readFile(file);
  if (!src) {
    failures.push(`${file} — MISSING`);
    continue;
  }
  if (!/useUrlSort\s*\(/.test(src)) {
    failures.push(`${file} (${label}) — must call useUrlSort() to persist sort in the URL`);
  }
  if (!/from ["'].*useUrlSort["']/.test(src)) {
    failures.push(`${file} (${label}) — must import useUrlSort from the shared hook`);
  }
  if (!/sortKey=\{sortKey\}/.test(src)) {
    failures.push(`${file} (${label}) — must wire sortKey={sortKey} onto <ParityTable>`);
  }
  if (!/onSortChange=\{onSortChange\}/.test(src)) {
    failures.push(`${file} (${label}) — must wire onSortChange={onSortChange} onto <ParityTable>`);
  }
  const nonSortable = findNonSortableDataColumns(src);
  if (nonSortable.length > 0) {
    failures.push(
      `${file} (${label}) — data column(s) missing sortable: true: ${nonSortable.join(", ")}`,
    );
  }
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL} — OK (Customers, Vendors, A/P Aging — every data column sortable + URL-persisted ` +
    `via the shared useUrlSort hook)`,
);
