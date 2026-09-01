#!/usr/bin/env node
/**
 * verify-paritytable-column-law — COLUMN LAW 2026-09-01 (COL-02 + COL-03).
 *
 * Owner register rows COL-02 (drag-to-reorder) and COL-03 (auto-fit so Payee/Vendor/State show
 * fully) were filed STILL OPEN because an earlier sweep grepped for `columnOrder` / `autoFit`
 * while ParityTable implements `colOrder` / `autoFitWidths`. This guard pins the real contract:
 *
 * COL-02 — enableColumnReorder defaults true; draggable headers; onDragStart/onDrop persist colOrder
 *          via storageKey (or controlled columnOrder + onColumnOrderChange for useTablePref pages).
 * COL-03 — autoFitColumns defaults true; canvas measureText widths applied when no manual colWidths;
 *          manual resize always wins over auto-fit.
 *
 * Register/money grids inherit by default — no per-page patch required when storageKey is set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-paritytable-column-law";
const COMPONENT = "apps/frontend/src/components/parity/ParityTable.tsx";
const TESTS = "apps/frontend/src/components/parity/ParityTable.test.tsx";

function assertComponent(src) {
  const errors = [];
  if (!/enableColumnReorder\s*=\s*true/.test(src)) {
    errors.push(`${COMPONENT}: enableColumnReorder must default to true (systemwide inherit)`);
  }
  if (!/autoFitColumns\s*=\s*true/.test(src)) {
    errors.push(`${COMPONENT}: autoFitColumns must default to true (systemwide inherit)`);
  }
  if (!src.includes("columnOrder?: string[]")) {
    errors.push(`${COMPONENT}: missing optional controlled prop columnOrder?: string[]`);
  }
  if (!src.includes("onColumnOrderChange?: (order: string[]) => void")) {
    errors.push(`${COMPONENT}: missing optional controlled prop onColumnOrderChange`);
  }
  if (!/isColumnOrderControlled\s*=\s*onColumnOrderChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled column order must key off onColumnOrderChange != null`);
  }
  if (!src.includes("colOrder?: string[]")) {
    errors.push(`${COMPONENT}: persisted storage must include colOrder for drag reorder`);
  }
  if (!/const autoFitWidths = useMemo/.test(src)) {
    errors.push(`${COMPONENT}: missing autoFitWidths useMemo (COL-03 auto-fit)`);
  }
  if (!src.includes("measureTextWidth(")) {
    errors.push(`${COMPONENT}: missing measureTextWidth helper for content-based column sizing`);
  }
  if (!/colWidths\[key\]\s*\?\?\s*autoFitWidths\[key\]/.test(src)) {
    errors.push(`${COMPONENT}: header width must prefer manual colWidths then autoFitWidths`);
  }
  if (!/draggable=\{enableColumnReorder\}/.test(src)) {
    errors.push(`${COMPONENT}: column headers must set draggable={enableColumnReorder}`);
  }
  if (!/onDragStart=\{enableColumnReorder/.test(src)) {
    errors.push(`${COMPONENT}: column headers must wire onDragStart when reorder enabled`);
  }
  if (!src.includes("onDrop=") || !src.includes("moveColumn(dragKey, key)")) {
    errors.push(`${COMPONENT}: column headers must wire onDrop → moveColumn for reorder`);
  }
  if (!src.includes("function moveColumn(")) {
    errors.push(`${COMPONENT}: missing moveColumn helper for drag reorder`);
  }
  if (!/if \(!autoFitColumns\) return \{\}/.test(src)) {
    errors.push(`${COMPONENT}: autoFitColumns=false must skip auto-fit width computation`);
  }
  // SWEEP-A / SORT-01 — sortable header button must fill the <th> (DataTable already w-full);
  // label-only inline-flex left most of the header dead; resize grip keeps the right w-2 edge.
  const sortBtn = src.match(/column\.sortable \? \(\s*<button[\s\S]{0,1200}?onClick=\{\(\) => toggleSort\(key\)\}/);
  if (!sortBtn) {
    errors.push(`${COMPONENT}: could not locate sortable header <button> (structure drift)`);
  } else if (!/\bh-full\b/.test(sortBtn[0]) || !/\bw-full\b/.test(sortBtn[0])) {
    errors.push(
      `${COMPONENT}: sortable header <button> must use h-full w-full (full-cell hit target; not label-only)`,
    );
  }
  if (!/data-testid="parity-table-col-resize"/.test(src)) {
    errors.push(`${COMPONENT}: column resize grip must stay a separate absolute w-2 edge (parity-table-col-resize)`);
  }
  return errors;
}

function assertTests(src) {
  const errors = [];
  const required = [
    "COLUMN LAW 2026-09-01 — auto-fit + reorder",
    "auto-fits a column to its content when no manual width is persisted",
    "a manual resize wins over auto-fit and is never overwritten by it",
    "dragging a header onto another reorders the columns and persists the order",
    "controlled columnOrder: drag notifies onColumnOrderChange without mutating internal state",
    "autoFitColumns=false skips content-based width measurement",
    "SWEEP-A — sortable header button fills the th cell (w-full h-full hit target)",
  ];
  for (const name of required) {
    if (!src.includes(name)) {
      errors.push(`${TESTS}: missing COLUMN LAW test: "${name}"`);
    }
  }
  return errors;
}

function assertRegisterDefaults() {
  const errors = [];
  const registerPages = [
    "apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx",
    "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
    "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  ];
  for (const page of registerPages) {
    const abs = path.join(ROOT, page);
    if (!fs.existsSync(abs)) continue;
    const pageSrc = fs.readFileSync(abs, "utf8");
    if (!pageSrc.includes("<ParityTable")) {
      errors.push(`${page}: expected ParityTable for register/money grid inherit`);
      continue;
    }
    if (!/storageKey=/.test(pageSrc)) {
      errors.push(`${page}: ParityTable must set storageKey so colOrder/colWidths persist`);
    }
    if (/enableColumnReorder=\{false\}/.test(pageSrc)) {
      errors.push(`${page}: must not disable enableColumnReorder without written reason`);
    }
    if (/autoFitColumns=\{false\}/.test(pageSrc)) {
      errors.push(`${page}: must not disable autoFitColumns without written reason`);
    }
  }
  return errors;
}

function selftest() {
  const goodComponent = `
    enableColumnReorder = true,
    columnOrder?: string[];
    onColumnOrderChange?: (order: string[]) => void;
    autoFitColumns = true,
    colOrder?: string[];
    const isColumnOrderControlled = onColumnOrderChange != null;
    const autoFitWidths = useMemo(() => {
      if (!autoFitColumns) return {};
      const w = colWidths[key] ?? autoFitWidths[key];
    }, [autoFitColumns]);
    function measureTextWidth() {}
    function moveColumn(a,b) {}
    draggable={enableColumnReorder}
    onDragStart={enableColumnReorder ? () => {} : undefined}
    onDrop={enableColumnReorder ? (e) => { if (dragKey) moveColumn(dragKey, key); } : undefined}
    const w = colWidths[key] ?? autoFitWidths[key];
    {column.sortable ? (
    <button type="button" className="inline-flex h-full w-full items-center gap-1" onClick={() => toggleSort(key)}>label</button>) : null}
    data-testid="parity-table-col-resize"
  `;
  const badComponent = `export function ParityTable() { return <table />; }`;
  const goodTests = `
    describe("COLUMN LAW 2026-09-01 — auto-fit + reorder", () => {
      it("auto-fits a column to its content when no manual width is persisted", () => {});
      it("a manual resize wins over auto-fit and is never overwritten by it", () => {});
      it("dragging a header onto another reorders the columns and persists the order", () => {});
      it("controlled columnOrder: drag notifies onColumnOrderChange without mutating internal state", () => {});
      it("autoFitColumns=false skips content-based width measurement", () => {});
      it("SWEEP-A — sortable header button fills the th cell (w-full h-full hit target)", () => {});
    });
  `;
  const badTests = `it("renders", () => {});`;

  if (assertComponent(goodComponent).length) {
    console.error(`${LABEL} --selftest FAIL good component:`, assertComponent(goodComponent));
    process.exit(1);
  }
  if (assertComponent(badComponent).length < 5) {
    console.error(`${LABEL} --selftest FAIL bad component should fail hard`);
    process.exit(1);
  }
  if (assertTests(goodTests).length) {
    console.error(`${LABEL} --selftest FAIL good tests:`, assertTests(goodTests));
    process.exit(1);
  }
  if (assertTests(badTests).length !== 7) {
    console.error(`${LABEL} --selftest FAIL bad tests should miss all 7`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const componentSrc = fs.readFileSync(path.join(ROOT, COMPONENT), "utf8");
  const testsSrc = fs.readFileSync(path.join(ROOT, TESTS), "utf8");
  const errors = [
    ...assertComponent(componentSrc),
    ...assertTests(testsSrc),
    ...assertRegisterDefaults(),
  ];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ParityTable COL-02 drag-reorder (colOrder + controlled columnOrder) and COL-03 auto-fit (autoFitWidths + autoFitColumns default on) pinned; register/money grids inherit via storageKey.`,
  );
}

main();
