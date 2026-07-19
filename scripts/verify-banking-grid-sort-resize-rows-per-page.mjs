#!/usr/bin/env node
/**
 * verify-banking-grid-sort-resize-rows-per-page.mjs
 *
 * Block: banking-grid-sort-resize-rows-per-page (tier-3, backlog id in
 * docs/trackers/backlog-verify/accounting.md + .block-ready/banking-grid-sort-resize-rows-per-page.json).
 *
 * Backlog evidence said "every TableHeaderCell instance still hardcodes sortable={false}" on
 * apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx. That claim is now
 * stale — the Date/Description/Amount(+Spent/Received)/Payee headers are real clickable asc/desc
 * sort, wired into the tableRows sort → group → page pipeline (bankTxnSortGroup.ts), alongside the
 * existing resizable-column (useTablePref) and rows-per-page (viewSettings.pageSize) controls.
 *
 * This guard locks that state so none of the three pillars can silently regress:
 *   1. SORT REAL, NOT THEATER — date/description/amount-or-spent/payee headers are sortable (no
 *      `sortable={false}`) AND `tableRows` actually re-sorts on `sortBy` (a real `.sort()` keyed off
 *      `sortBy.dir`/`sortBy.key`, not a static no-op) AND clicking the same column flips asc<->desc.
 *   2. RESIZE PRESERVED — those same sortable header cells still carry `onResize={setTxColWidth}` /
 *      `width={txColWidth(...)}` (the shared TableHeaderCell/useTablePref pattern).
 *   3. ROWS-PER-PAGE PRESERVED — the page-size picker (`viewSettings.pageSize`, the [50,75,100,200,300]
 *      option set with a `setViewSettings` click handler) still exists.
 *
 * Usage:
 *   node scripts/verify-banking-grid-sort-resize-rows-per-page.mjs            # scan the real file
 *   node scripts/verify-banking-grid-sort-resize-rows-per-page.mjs --selftest # pure-logic selftest
 *
 * LINKAGE: N/A (frontend-only regression guard; no schema/table/route touched). Additive only.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TARGET = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

/** Strip block/line/JSX comments so explanatory prose can't satisfy a check. */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Pull the `<TableHeaderCell columnKey="X" ... />` block for one column so checks stay column-scoped. */
function headerBlock(src, columnKey) {
  const re = new RegExp(`<TableHeaderCell\\s+columnKey="${columnKey}"[\\s\\S]*?/>`);
  return (src.match(re) ?? [""])[0];
}

const SORT_RESIZE_COLUMNS = ["date", "description", "amount", "payee"];

/** The assertions, each a predicate over the comment-stripped source. */
export function checksFor(src) {
  const headers = Object.fromEntries(SORT_RESIZE_COLUMNS.map((k) => [k, headerBlock(src, k)]));

  const headerExistsAndSortable = SORT_RESIZE_COLUMNS.every(
    (k) => headers[k].length > 0 && !/sortable=\{false\}/.test(headers[k])
  );
  const headerWiredToSortState = SORT_RESIZE_COLUMNS.every(
    (k) => /sortKey=\{sortBy\.key\}/.test(headers[k]) && /onToggleSort=\{onToggleSortCol\}/.test(headers[k])
  );
  const headerResizePreserved = SORT_RESIZE_COLUMNS.every(
    (k) => /onResize=\{setTxColWidth\}/.test(headers[k]) && /width=\{txColWidth\(/.test(headers[k])
  );

  return {
    // Pillar 1a — the 4 columns exist and are real sortable headers (no sortable={false} escape hatch).
    headerExistsAndSortable,
    // Pillar 1b — those headers are actually wired to the live sort state + toggle handler.
    headerWiredToSortState,
    // Pillar 1c — toggling the SAME key flips asc<->desc (not a fresh default every click).
    toggleFlipsDirection: /prev\.key === key\s*\?\s*\{\s*key,\s*dir:\s*prev\.dir === "asc" \? "desc" : "asc"\s*\}/.test(
      src
    ),
    // Pillar 1d — tableRows performs a REAL sort keyed off sortBy (not UI-only theater): the sort
    // direction is derived from sortBy.dir and at least date/description/amount are real sort keys.
    tableRowsRealSort:
      /const sortDir = sortBy\.dir === "asc" \? 1 : -1/.test(src) &&
      /return \[\.\.\.filtered\]\.sort\(\(a, b\) => \{/.test(src) &&
      /sortBy\.key === "description"/.test(src) &&
      /sortBy\.key === "amount"/.test(src),
    // Pillar 2 — resize is preserved on every sortable header (shared TableHeaderCell/useTablePref pair).
    headerResizePreserved,
    // Pillar 3 — rows-per-page picker preserved (viewSettings.pageSize + the option set + setter).
    rowsPerPagePreserved:
      /\[50, 75, 100, 200, 300\] as const/.test(src) &&
      /setViewSettings\(\(prev\) => \(\{ \.\.\.prev, pageSize: size \}\)\)/.test(src) &&
      /viewSettings\.pageSize/.test(src),
  };
}

const CHECK_LABELS = {
  headerExistsAndSortable: "date/description/amount/payee headers exist and are sortable (no sortable={false})",
  headerWiredToSortState: "those headers are wired to sortKey={sortBy.key} + onToggleSort={onToggleSortCol}",
  toggleFlipsDirection: "clicking the active sort column flips asc<->desc (not always resetting)",
  tableRowsRealSort: "tableRows performs a real sortBy-keyed .sort() (not UI-only sort theater)",
  headerResizePreserved: "sortable headers still carry onResize/width (column resize preserved)",
  rowsPerPagePreserved: "rows-per-page picker (viewSettings.pageSize) preserved",
};

export function run() {
  const full = path.join(repoRoot, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[verify-banking-grid-sort-resize-rows-per-page] FAIL — missing ${TARGET}`);
    return { ok: false, offenders: [`${TARGET} — MISSING`] };
  }
  const src = stripComments(fs.readFileSync(full, "utf8"));
  const results = checksFor(src);
  const offenders = Object.entries(results)
    .filter(([, ok]) => !ok)
    .map(([key]) => CHECK_LABELS[key]);
  if (offenders.length) {
    console.error("[verify-banking-grid-sort-resize-rows-per-page] FAIL — banking grid sort/resize/rows-per-page regressed:");
    for (const f of offenders) console.error(`  - ${f}`);
    return { ok: false, offenders };
  }
  console.log(
    "[verify-banking-grid-sort-resize-rows-per-page] PASS — real sort + resize + rows-per-page all locked"
  );
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const good = `
    const [sortBy, setSortBy] = useState({ key: "date", dir: "desc" });
    const toggleSort = (key) =>
      setSortBy((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));
    const onToggleSortCol = (key) => toggleSort(key);
    const tableRows = useMemo(() => {
      const filtered = source.filter((tx) => true);
      const sortDir = sortBy.dir === "asc" ? 1 : -1;
      const sortVal = (tx) => {
        if (sortBy.key === "description") return tx.description;
        if (sortBy.key === "amount") return tx.amount;
        return tx.transaction_date;
      };
      return [...filtered].sort((a, b) => {
        const va = sortVal(a);
        const vb = sortVal(b);
        if (va < vb) return -1 * sortDir;
        return 0;
      });
    }, [sortBy]);
    <TableHeaderCell columnKey="date" label="Date" sortKey={sortBy.key} sortDir={sortBy.dir} onToggleSort={onToggleSortCol} width={txColWidth("date")} onResize={setTxColWidth} />
    <TableHeaderCell columnKey="description" label="Full bank description" sortKey={sortBy.key} sortDir={sortBy.dir} onToggleSort={onToggleSortCol} width={txColWidth("description")} onResize={setTxColWidth} />
    <TableHeaderCell columnKey="amount" label="Amount" sortKey={sortBy.key} sortDir={sortBy.dir} onToggleSort={onToggleSortCol} width={txColWidth("amount")} onResize={setTxColWidth} />
    <TableHeaderCell columnKey="payee" label="Payee" sortKey={sortBy.key} sortDir={sortBy.dir} onToggleSort={onToggleSortCol} width={txColWidth("payee")} onResize={setTxColWidth} />
    {([50, 75, 100, 200, 300] as const).map((size) => (
      <button onClick={() => setViewSettings((prev) => ({ ...prev, pageSize: size }))}>{size}</button>
    ))}
    <p>{viewSettings.pageSize}</p>
  `;
  const badHardcodedFalse = good.replace(
    '<TableHeaderCell columnKey="date" label="Date" sortKey={sortBy.key}',
    '<TableHeaderCell columnKey="date" label="Date" sortable={false} sortKey={sortBy.key}'
  );
  const badUiOnlyTheater = good
    .replace(/const sortDir = sortBy\.dir === "asc" \? 1 : -1;[\s\S]*?\}, \[sortBy\]\);/, "const tableRows = source;")
    .replace(
      'const toggleSort = (key) =>\n      setSortBy((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));',
      'const toggleSort = (key) => setSortBy({ key, dir: "asc" });'
    );
  const badNoResize = good.replace(/ onResize=\{setTxColWidth\}/g, "");
  const badNoPageSize = good.replace(/\[50, 75, 100, 200, 300\] as const/, "[10, 25] as const");

  const g = checksFor(stripComments(good));
  const bFalse = checksFor(stripComments(badHardcodedFalse));
  const bTheater = checksFor(stripComments(badUiOnlyTheater));
  const bNoResize = checksFor(stripComments(badNoResize));
  const bNoPageSize = checksFor(stripComments(badNoPageSize));

  const failures = [];
  for (const key of Object.keys(CHECK_LABELS)) {
    if (!g[key]) failures.push(`good fixture should PASS ${key}`);
  }
  if (bFalse.headerExistsAndSortable) failures.push("sortable={false} fixture should FAIL headerExistsAndSortable");
  if (bTheater.tableRowsRealSort) failures.push("UI-only-theater fixture should FAIL tableRowsRealSort");
  if (bTheater.toggleFlipsDirection) failures.push("UI-only-theater fixture should FAIL toggleFlipsDirection");
  if (bNoResize.headerResizePreserved) failures.push("no-resize fixture should FAIL headerResizePreserved");
  if (bNoPageSize.rowsPerPagePreserved) failures.push("no-pageSize fixture should FAIL rowsPerPagePreserved");

  if (failures.length) {
    console.error("[verify-banking-grid-sort-resize-rows-per-page] SELFTEST FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `[verify-banking-grid-sort-resize-rows-per-page] SELFTEST PASS — ${Object.keys(CHECK_LABELS).length} checks discriminate real vs fake`
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
