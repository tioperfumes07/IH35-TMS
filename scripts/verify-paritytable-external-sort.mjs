#!/usr/bin/env node
/**
 * verify-paritytable-external-sort — ParityTable Phase A4 guard.
 *
 * Pins the ADDITIVE external-sort passthrough on the shared ParityTable:
 * an OPTIONAL `sortMode?: "internal" | "external"` prop, modeled on the
 * controlled-sort / A1 / A2 / A3 precedents. The prop must stay OPTIONAL and
 * default to "internal" so the ~130 existing call sites keep byte-identical
 * internal sorting. Also pins:
 *  - external mode requires controlled sort: isSortExternal = sortMode === "external"
 *    AND isSortControlled — "external" without onSortChange falls back to internal
 *  - the sortedRows useMemo short-circuits to the IDENTITY `rows` (no copy, no
 *    .sort) when isSortExternal, BEFORE any sorting work
 *  - header clicks still fire onSortChange (toggleSort's controlled path preserved)
 *  - unit coverage in ParityTable.test.tsx for external identity order, header-click
 *    notify-without-reorder, the internal default regression pin, and the
 *    external-without-controlled-sort fallback.
 *
 * Root cause this protects: BankingTransactionsDesignView Phase B owns a CI-guarded
 * sort→group→page pipeline (bankTxnSortGroup) whose caller-produced order (money-in/out
 * band reordering) MUST NOT be re-sorted by ParityTable when sortKey is painted.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-paritytable-external-sort";
const COMPONENT = "apps/frontend/src/components/parity/ParityTable.tsx";
const TESTS = "apps/frontend/src/components/parity/ParityTable.test.tsx";

function assertComponent(src) {
  const errors = [];
  // The prop must exist and stay OPTIONAL (the `?` is the ~130-call-site safety line).
  if (!/sortMode\?:\s*"internal"\s*\|\s*"external"/.test(src)) {
    errors.push(`${COMPONENT}: missing optional prop \`sortMode?: "internal" | "external"\``);
  }
  // Default must be "internal" (current behavior when omitted).
  if (!/sortMode\s*=\s*"internal"/.test(src)) {
    errors.push(`${COMPONENT}: sortMode must default to "internal" (destructure default)`);
  }
  // External mode requires controlled sort — never external without onSortChange.
  if (!/isSortExternal\s*=\s*sortMode\s*===\s*"external"\s*&&\s*isSortControlled/.test(src)) {
    errors.push(
      `${COMPONENT}: external mode must require controlled sort (\`isSortExternal = sortMode === "external" && isSortControlled\`)`,
    );
  }
  // The sort useMemo must short-circuit to the identity `rows` BEFORE any sort work.
  const memoMatch = src.match(/const sortedRows = useMemo\(\(\) => \{([\s\S]*?)\}, \[/);
  if (!memoMatch) {
    errors.push(`${COMPONENT}: sortedRows useMemo not found`);
  } else {
    const body = memoMatch[1];
    const identityIdx = body.indexOf("if (isSortExternal) return rows;");
    const sortIdx = body.indexOf(".sort(");
    if (identityIdx === -1) {
      errors.push(
        `${COMPONENT}: sortedRows useMemo must short-circuit \`if (isSortExternal) return rows;\` (identity — no copy, no sort)`,
      );
    } else if (sortIdx !== -1 && identityIdx > sortIdx) {
      errors.push(
        `${COMPONENT}: the isSortExternal identity return must come BEFORE the .sort( call in sortedRows`,
      );
    }
    if (sortIdx === -1) {
      errors.push(`${COMPONENT}: internal sort path (.sort) must be preserved for default mode`);
    }
  }
  // The memo must re-evaluate when the mode flips.
  if (!/\[rows,\s*columns,\s*sortKey,\s*sortDirection,\s*isSortExternal\]/.test(src)) {
    errors.push(`${COMPONENT}: sortedRows useMemo deps must include isSortExternal`);
  }
  // Header clicks must still notify the controlled owner (toggleSort's controlled path).
  if (!src.includes("onSortChange?.(")) {
    errors.push(`${COMPONENT}: header clicks must fire onSortChange in controlled mode`);
  }
  // The controlled-sort precedent this mode builds on must still exist.
  if (!/isSortControlled\s*=\s*onSortChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled-sort precedent (isSortControlled) must be preserved`);
  }
  return errors;
}

function assertTests(src) {
  const errors = [];
  const required = [
    "external + controlled: rows stay in INPUT order even when sortKey would reorder them internally",
    "external + controlled: header click fires onSortChange but row order does not change without a parent update",
    "omitted sortMode keeps today's internal sort (regression pin for ~130 call sites)",
    'explicit sortMode="internal" sorts exactly like the omitted default',
    'sortMode="external" WITHOUT onSortChange falls back to internal (external requires controlled sort)',
  ];
  for (const name of required) {
    if (!src.includes(name)) {
      errors.push(`${TESTS}: missing external-sort test: "${name}"`);
    }
  }
  return errors;
}

function selftest() {
  const goodComponent = `
    export type ParityTableProps<T> = {
      sortKey?: string;
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
      sortMode?: "internal" | "external";
    };
    export function ParityTable({ onSortChange, sortMode = "internal" }) {
      const isSortControlled = onSortChange != null;
      const isSortExternal = sortMode === "external" && isSortControlled;
      const sortedRows = useMemo(() => {
        if (isSortExternal) return rows;
        if (!sortKey) return rows;
        const copy = [...rows];
        copy.sort((a, b) => 0);
        return copy;
      }, [rows, columns, sortKey, sortDirection, isSortExternal]);
      function toggleSort(key) {
        if (isSortControlled) { onSortChange?.(key, "asc"); return; }
      }
    }
  `;
  // Pre-A4 shape: controlled sort exists but ALWAYS re-sorts internally when sortKey is
  // set (the exact shape ParityTable had before this block — the guard must fail on it).
  const badComponent = `
    export type ParityTableProps<T> = {
      sortKey?: string;
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
    };
    export function ParityTable({ onSortChange }) {
      const isSortControlled = onSortChange != null;
      const sortedRows = useMemo(() => {
        if (!sortKey) return rows;
        const copy = [...rows];
        copy.sort((a, b) => 0);
        return copy;
      }, [rows, columns, sortKey, sortDirection]);
      function toggleSort(key) {
        if (isSortControlled) { onSortChange?.(key, "asc"); return; }
      }
    }
  `;
  // Planted violation: the prop exists but the identity return sits AFTER the sort — the
  // rows are already reordered by the time "external" is honored. The guard must fail.
  const plantedComponent = `
    export type ParityTableProps<T> = {
      sortKey?: string;
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
      sortMode?: "internal" | "external";
    };
    export function ParityTable({ onSortChange, sortMode = "internal" }) {
      const isSortControlled = onSortChange != null;
      const isSortExternal = sortMode === "external" && isSortControlled;
      const sortedRows = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => 0);
        if (isSortExternal) return rows;
        return copy;
      }, [rows, columns, sortKey, sortDirection, isSortExternal]);
      function toggleSort(key) {
        if (isSortControlled) { onSortChange?.(key, "asc"); return; }
      }
    }
  `;
  const goodTests = `
    it('external + controlled: rows stay in INPUT order even when sortKey would reorder them internally', () => {});
    it("external + controlled: header click fires onSortChange but row order does not change without a parent update", () => {});
    it("omitted sortMode keeps today's internal sort (regression pin for ~130 call sites)", () => {});
    it('explicit sortMode="internal" sorts exactly like the omitted default', () => {});
    it('sortMode="external" WITHOUT onSortChange falls back to internal (external requires controlled sort)', () => {});
  `;
  const badTests = `it("renders rows", () => {});`;

  if (assertComponent(goodComponent).length) {
    console.error(`${LABEL} --selftest FAIL good component fixture:`, assertComponent(goodComponent));
    process.exit(1);
  }
  if (assertComponent(badComponent).length < 3) {
    console.error(`${LABEL} --selftest FAIL pre-A4 component fixture should fail hard`);
    process.exit(1);
  }
  const plantedErrors = assertComponent(plantedComponent);
  if (!plantedErrors.some((e) => e.includes("must come BEFORE"))) {
    console.error(
      `${LABEL} --selftest FAIL planted violation (identity return AFTER sort) must be caught:`,
      plantedErrors,
    );
    process.exit(1);
  }
  if (assertTests(goodTests).length) {
    console.error(`${LABEL} --selftest FAIL good tests fixture:`, assertTests(goodTests));
    process.exit(1);
  }
  if (assertTests(badTests).length !== 5) {
    console.error(`${LABEL} --selftest FAIL bad tests fixture should miss all 5`);
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
    `OK ${LABEL}: ParityTable exposes optional sortMode ("internal" default); "external" + controlled sort short-circuits sortedRows to the identity rows before any sort; header clicks still notify onSortChange; unit coverage present.`,
  );
}

main();
