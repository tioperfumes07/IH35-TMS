#!/usr/bin/env node
/**
 * verify-paritytable-controlled-pagination — ParityTable Phase A3 guard.
 *
 * Pins the ADDITIVE controlled/external pagination API on the shared ParityTable
 * (page / onPageChange / pageSize / onPageSizeChange / hidePager), modeled on the
 * controlled-sort and A1 controlled-expansion precedents. All five props must stay
 * OPTIONAL so the ~130 existing call sites keep byte-identical internal pagination.
 * Also pins:
 *  - controlled page mode = presence of onPageChange (mirror of isSortControlled)
 *  - controlled page-size mode = VALUE-presence (pageSize != null) so a pre-paged
 *    caller can pin the size with no callback
 *  - controlled clicks notify the owner and never mutate internal page state
 *  - hidePager suppresses the built-in pager chrome entirely
 *  - unit coverage in ParityTable.test.tsx for uncontrolled default, controlled
 *    page, hidePager, and controlled pageSize.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-paritytable-controlled-pagination";
const COMPONENT = "apps/frontend/src/components/parity/ParityTable.tsx";
const TESTS = "apps/frontend/src/components/parity/ParityTable.test.tsx";

function assertComponent(src) {
  const errors = [];
  // All five props OPTIONAL (the `?` is the 130-call-site safety line).
  if (!src.includes("page?: number")) {
    errors.push(`${COMPONENT}: missing optional prop \`page?: number\``);
  }
  if (!src.includes("onPageChange?: (page: number) => void")) {
    errors.push(`${COMPONENT}: missing optional prop \`onPageChange?: (page: number) => void\``);
  }
  if (!/\bpageSize\?: number;/.test(src)) {
    errors.push(`${COMPONENT}: missing optional prop \`pageSize?: number\``);
  }
  if (!src.includes("onPageSizeChange?: (size: number) => void")) {
    errors.push(`${COMPONENT}: missing optional prop \`onPageSizeChange?: (size: number) => void\``);
  }
  if (!src.includes("hidePager?: boolean")) {
    errors.push(`${COMPONENT}: missing optional prop \`hidePager?: boolean\``);
  }
  // Controlled page mode = presence of the notifier — the exact controlled-sort mirror.
  if (!/isPageControlled\s*=\s*onPageChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled page mode must be \`onPageChange != null\` (mirror isSortControlled)`);
  }
  // Controlled page-size mode = VALUE-presence (supports pre-paged callers with no callback).
  if (!/isPageSizeControlled\s*=\s*controlledPageSize\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled page-size mode must be VALUE-presence \`controlledPageSize != null\``);
  }
  // Uncontrolled internal page state must survive (default path for existing consumers).
  if (!/internalPage.*useState\(1\)/.test(src)) {
    errors.push(`${COMPONENT}: internal uncontrolled page state (useState(1)) must be preserved`);
  }
  // Controlled clicks must notify the owner, not mutate internal state.
  if (!src.includes("onPageChange?.(")) {
    errors.push(`${COMPONENT}: controlled pager clicks must fire onPageChange with the next page`);
  }
  if (!src.includes("onPageSizeChange?.(")) {
    errors.push(`${COMPONENT}: per-page selector must fire onPageSizeChange when provided`);
  }
  // Controlled page render must default to 1 when the prop is undefined.
  if (!/controlledPage\s*\?\?\s*1/.test(src)) {
    errors.push(`${COMPONENT}: controlled page must render \`controlledPage ?? 1\` when undefined`);
  }
  // hidePager suppresses the built-in pager chrome entirely.
  if (!/hidePager\s*\?\s*null\s*:/.test(src)) {
    errors.push(`${COMPONENT}: hidePager must suppress the built-in pager chrome (\`hidePager ? null :\`)`);
  }
  // hidePager must default to false (current behavior).
  if (!src.includes("hidePager = false")) {
    errors.push(`${COMPONENT}: hidePager must default to false (current behavior)`);
  }
  if (!src.includes("pageSizeOptions = [25, 50, 100, 300]")) {
    errors.push(`${COMPONENT}: default pageSizeOptions must be QBO 25/50/100/300`);
  }
  if (!src.includes("changePageSize(next)") || !src.includes('htmlFor="parity-gear-page-size"')) {
    errors.push(`${COMPONENT}: gear rows-per-page select must apply immediately via changePageSize(next)`);
  }
  // The controlled-sort precedent this API mirrors must still exist.
  if (!/isSortControlled\s*=\s*onSortChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled-sort precedent (isSortControlled) must be preserved`);
  }
  return errors;
}

function assertTests(src) {
  const errors = [];
  const required = [
    "uncontrolled default is unchanged: built-in pager renders and Next advances internally",
    "controlled mode: Next fires onPageChange(2) and does not advance until the page prop updates",
    "controlled mode defaults to page 1 when the page prop is undefined",
    "hidePager: no pager chrome in the DOM",
    "controlled pageSize: the prop drives slicing; the selector fires onPageSizeChange without internal mutation",
    "pre-paged combination: pageSize = rows.length + hidePager renders every provided row with no pager",
    "gear drafts QBO rows-per-page 25/50/100/300 and applies when the gear rows-per-page select changes",
  ];
  for (const name of required) {
    if (!src.includes(name)) {
      errors.push(`${TESTS}: missing controlled-pagination test: "${name}"`);
    }
  }
  return errors;
}

function selftest() {
  const goodComponent = `
    export type ParityTableProps<T> = {
      sortKey?: string;
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
      page?: number;
      onPageChange?: (page: number) => void;
      pageSize?: number;
      onPageSizeChange?: (size: number) => void;
      hidePager?: boolean;
    };
    export function ParityTable({ onSortChange, page: controlledPage, onPageChange, pageSize: controlledPageSize, onPageSizeChange, hidePager = false, pageSizeOptions = [25, 50, 100, 300] }) {
      const isSortControlled = onSortChange != null;
      const isPageControlled = onPageChange != null;
      const [internalPage, setInternalPage] = useState(1);
      const page = isPageControlled ? controlledPage ?? 1 : internalPage;
      const isPageSizeControlled = controlledPageSize != null;
      function changePage(next) {
        if (isPageControlled) { onPageChange?.(next); return; }
        setInternalPage(next);
      }
      function changePageSize(next) {
        onPageSizeChange?.(next);
        if (!isPageSizeControlled) setInternalPageSize(next);
        changePage(1);
      }
      return hidePager ? null : (
        <label htmlFor="parity-gear-page-size">Rows per page</label>
      );
    }
  `;
  // Pre-A3 shape: internal-only pagination, always-rendered pager (the exact shape
  // ParityTable had before this block — the guard must fail on it).
  const badComponent = `
    export type ParityTableProps<T> = {
      sortKey?: string;
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
      pageSizeOptions?: number[];
      initialPageSize?: number;
    };
    export function ParityTable({ onSortChange }) {
      const isSortControlled = onSortChange != null;
      const [page, setPage] = useState(1);
      const [pageSize, setPageSize] = useState(15);
      return pager;
    }
  `;
  const goodTests = `
    it("uncontrolled default is unchanged: built-in pager renders and Next advances internally", () => {});
    it("controlled mode: Next fires onPageChange(2) and does not advance until the page prop updates", () => {});
    it("controlled mode defaults to page 1 when the page prop is undefined", () => {});
    it("hidePager: no pager chrome in the DOM (rows still slice internally)", () => {});
    it("controlled pageSize: the prop drives slicing; the selector fires onPageSizeChange without internal mutation", () => {});
    it("pre-paged combination: pageSize = rows.length + hidePager renders every provided row with no pager", () => {});
    it("gear drafts QBO rows-per-page 25/50/100/300 and applies when the gear rows-per-page select changes", () => {});
  `;
  const badTests = `it("renders rows", () => {});`;

  if (assertComponent(goodComponent).length) {
    console.error(`${LABEL} --selftest FAIL good component fixture:`, assertComponent(goodComponent));
    process.exit(1);
  }
  if (assertComponent(badComponent).length < 10) {
    console.error(`${LABEL} --selftest FAIL pre-A3 component fixture should fail hard`);
    process.exit(1);
  }
  if (assertTests(goodTests).length) {
    console.error(`${LABEL} --selftest FAIL good tests fixture:`, assertTests(goodTests));
    process.exit(1);
  }
  if (assertTests(badTests).length !== 7) {
    console.error(`${LABEL} --selftest FAIL bad tests fixture should miss all 7`);
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
  const errors = [...assertComponent(componentSrc), ...assertTests(testsSrc)];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ParityTable exposes optional page/onPageChange/pageSize/onPageSizeChange/hidePager; uncontrolled internal pagination preserved; controlled-sort mirror + unit coverage present.`,
  );
}

main();
