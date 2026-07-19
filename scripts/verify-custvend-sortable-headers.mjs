#!/usr/bin/env node
/**
 * verify-custvend-sortable-headers.mjs — BANK-SORT-ROLLOUT-ACCT CI guard (Customers/Vendors/AP-Aging)
 *
 * Locks URL-persisted ASC/DESC sort on Customers, Vendors, and Reports A/P Aging lists.
 *
 * Usage:
 *   node scripts/verify-custvend-sortable-headers.mjs
 *   node scripts/verify-custvend-sortable-headers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

export function extractColumnsRegion(source) {
  const inline = source.indexOf("columns={[");
  if (inline === -1) return source;
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

export function findNonSortableDataColumns(fullSource) {
  const source = extractColumnsRegion(fullSource);
  const offenders = [];
  const re = /\{\s*\n?\s*key:\s*["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const key = match[1];
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

export function custvendSortableErrors({ hookExists, pages }) {
  const failures = [];

  if (!hookExists) {
    failures.push(`${HOOK_FILE} — MISSING (required by Customers/Vendors/AP-Aging sort wiring)`);
  }

  for (const { file, label, src } of pages) {
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

  return failures;
}

function selftest() {
  const goodPage = `
    import { useUrlSort } from "../../hooks/useUrlSort";
    const { sortKey, onSortChange } = useUrlSort();
    columns={[
      { key: "name", sortable: true },
      { key: "balance", sortable: true },
      { key: "actions", label: "Actions" },
    ]}
    <ParityTable sortKey={sortKey} onSortChange={onSortChange} />
  `;

  const good = {
    hookExists: true,
    pages: PAGES.map(({ file, label }) => ({ file, label, src: goodPage })),
  };

  const planted = [
    ["missing hook", { ...good, hookExists: false }, "MISSING (required"],
    ["missing useUrlSort call", { ...good, pages: [{ ...good.pages[0], src: goodPage.replace("useUrlSort()", "") }, ...good.pages.slice(1)] }, "must call useUrlSort()"],
    ["missing sortKey wiring", { ...good, pages: [{ ...good.pages[0], src: goodPage.replace("sortKey={sortKey}", "") }, ...good.pages.slice(1)] }, "sortKey={sortKey}"],
    ["non-sortable data column", { ...good, pages: [{ ...good.pages[0], src: goodPage.replace("{ key: \"name\", sortable: true }", "{ key: \"name\" }") }, ...good.pages.slice(1)] }, "missing sortable: true: name"],
    ["Vendors regression", { ...good, pages: [good.pages[0], { ...good.pages[1], src: goodPage.replace("onSortChange={onSortChange}", "") }, good.pages[2]] }, "onSortChange={onSortChange}"],
  ];

  const goodErrors = custvendSortableErrors(good);
  const missed = planted.filter(([, fixture, needle]) => !custvendSortableErrors(fixture).some((f) => f.includes(needle)));
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const error of goodErrors) console.error(`  good fixture rejected: ${error}`);
    for (const [name] of missed) console.error(`  planted regression not caught: ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${planted.length} planted regressions caught)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = custvendSortableErrors({
  hookExists: fs.existsSync(path.join(ROOT, HOOK_FILE)),
  pages: PAGES.map(({ file, label }) => ({ file, label, src: readFile(file) })),
});

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `${LABEL} — OK (Customers, Vendors, A/P Aging — every data column sortable + URL-persisted ` +
    `via the shared useUrlSort hook)`,
);
