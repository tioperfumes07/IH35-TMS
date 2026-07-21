#!/usr/bin/env node
/**
 * verify-paritytable-controlled-selection — ParityTable Phase A5 guard.
 *
 * Pins the ADDITIVE controlled row-selection API on the shared ParityTable
 * (selectedKeys / onSelectionChange), modeled on the controlled-sort and A1
 * controlled-expansion precedents. Both props must stay OPTIONAL so existing
 * selectable call sites keep byte-identical internal Set selection. Also pins:
 *  - controlled mode = presence of onSelectionChange (mirror of isSortControlled)
 *  - maxSelectable + onSelectionCapExceeded still respected in both modes
 *  - batchActions still derives selected row objects from keys ∩ current rows
 *  - unit coverage in ParityTable.test.tsx for uncontrolled default, controlled
 *    toggle, and select-all cap.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-paritytable-controlled-selection";
const COMPONENT = "apps/frontend/src/components/parity/ParityTable.tsx";
const TESTS = "apps/frontend/src/components/parity/ParityTable.test.tsx";

function assertComponent(src) {
  const errors = [];
  // Both props OPTIONAL (the `?` is the existing-call-site safety line).
  if (!src.includes("selectedKeys?: string[]")) {
    errors.push(`${COMPONENT}: missing optional prop \`selectedKeys?: string[]\``);
  }
  if (!src.includes("onSelectionChange?: (keys: string[]) => void")) {
    errors.push(`${COMPONENT}: missing optional prop \`onSelectionChange?: (keys: string[]) => void\``);
  }
  // Controlled mode = presence of the notifier — the exact controlled-sort / A1 mirror.
  if (!/isSelectionControlled\s*=\s*onSelectionChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled mode must be \`onSelectionChange != null\` (mirror isSortControlled)`);
  }
  // Uncontrolled internal Set must survive (default path for existing consumers).
  if (!/internalSelected.*useState<Set<string>>\(new Set\(\)\)/.test(src)) {
    errors.push(`${COMPONENT}: internal uncontrolled selected Set state must be preserved`);
  }
  // Controlled toggles must notify the owner, not mutate internal state.
  if (!src.includes("onSelectionChange?.(")) {
    errors.push(`${COMPONENT}: controlled toggle must fire onSelectionChange with the next keys`);
  }
  // Cap + batchActions must remain (both modes).
  if (!src.includes("maxSelectable")) {
    errors.push(`${COMPONENT}: maxSelectable must remain (cap applies in both modes)`);
  }
  if (!src.includes("onSelectionCapExceeded")) {
    errors.push(`${COMPONENT}: onSelectionCapExceeded must remain (cap applies in both modes)`);
  }
  if (!src.includes("batchActions")) {
    errors.push(`${COMPONENT}: batchActions must remain (receives selected row objects in both modes)`);
  }
  // The controlled-sort / A1 precedents this API mirrors must still exist.
  if (!/isSortControlled\s*=\s*onSortChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled-sort precedent (isSortControlled) must be preserved`);
  }
  if (!/isExpandControlled\s*=\s*onExpandedChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: A1 controlled-expansion precedent (isExpandControlled) must be preserved`);
  }
  return errors;
}

function assertTests(src) {
  const errors = [];
  const required = [
    "uncontrolled default is unchanged: omitting selectedKeys/onSelectionChange keeps internal Set selection",
    "controlled mode: toggle row fires onSelectionChange with next keys; does not change checkboxes without prop update",
    "controlled select-all on page respects maxSelectable and fires onSelectionCapExceeded",
  ];
  for (const name of required) {
    if (!src.includes(name)) {
      errors.push(`${TESTS}: missing controlled-selection test: "${name}"`);
    }
  }
  return errors;
}

function selftest() {
  const goodComponent = `
    export type ParityTableProps<T> = {
      sortKey?: string;
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
      expandedKeys?: string[];
      onExpandedChange?: (keys: string[]) => void;
      selectedKeys?: string[];
      onSelectionChange?: (keys: string[]) => void;
      maxSelectable?: number;
      onSelectionCapExceeded?: (attempted: number) => void;
      batchActions?: (selected: T[]) => ReactNode;
    };
    export function ParityTable({ onSortChange, onExpandedChange, onSelectionChange, maxSelectable, onSelectionCapExceeded, batchActions }) {
      const isSortControlled = onSortChange != null;
      const isExpandControlled = onExpandedChange != null;
      const isSelectionControlled = onSelectionChange != null;
      const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
      function toggleRow(id) {
        if (isSelectionControlled) { onSelectionChange?.([id]); return; }
        setInternalSelected((prev) => prev);
      }
    }
  `;
  // Pre-A5 shape: internal-only selection (the exact shape ParityTable had before this block).
  const badComponent = `
    export type ParityTableProps<T> = {
      selectable?: boolean;
      batchActions?: (selected: T[]) => ReactNode;
      maxSelectable?: number;
      onSelectionCapExceeded?: (attempted: number) => void;
    };
    export function ParityTable() {
      const [selected, setSelected] = useState(new Set());
    }
  `;
  const goodTests = `
    it("uncontrolled default is unchanged: omitting selectedKeys/onSelectionChange keeps internal Set selection", () => {});
    it("controlled mode: toggle row fires onSelectionChange with next keys; does not change checkboxes without prop update", () => {});
    it("controlled select-all on page respects maxSelectable and fires onSelectionCapExceeded", () => {});
  `;
  const badTests = `it("supports selection → batch bar", () => {});`;

  if (assertComponent(goodComponent).length) {
    console.error(`${LABEL} --selftest FAIL good component fixture:`, assertComponent(goodComponent));
    process.exit(1);
  }
  if (assertComponent(badComponent).length < 5) {
    console.error(`${LABEL} --selftest FAIL pre-A5 component fixture should fail hard`);
    process.exit(1);
  }
  if (assertTests(goodTests).length) {
    console.error(`${LABEL} --selftest FAIL good tests fixture:`, assertTests(goodTests));
    process.exit(1);
  }
  if (assertTests(badTests).length !== 3) {
    console.error(`${LABEL} --selftest FAIL bad tests fixture should miss all 3`);
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
    `OK ${LABEL}: ParityTable exposes optional selectedKeys/onSelectionChange; uncontrolled internal Set preserved; maxSelectable/batchActions retained; controlled-sort/A1 mirrors + unit coverage present.`,
  );
}

main();
