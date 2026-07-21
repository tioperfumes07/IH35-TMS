#!/usr/bin/env node
/**
 * verify-paritytable-controlled-expansion — ParityTable Phase A1 guard.
 *
 * Pins the ADDITIVE controlled row-expansion API on the shared ParityTable
 * (expandedKeys / onExpandedChange / expandMode), modeled on the controlled-sort
 * precedent (sortKey/sortDirection/onSortChange). All three props must stay
 * OPTIONAL so the ~130 existing call sites keep byte-identical uncontrolled
 * multi-expand behavior via the internal expanded Set. Also pins:
 *  - controlled mode = presence of onExpandedChange (mirror of isSortControlled)
 *  - expandMode default "multi" (current behavior); "single" collapses others
 *  - unit coverage in ParityTable.test.tsx for uncontrolled default, controlled
 *    mode, and single mode.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-paritytable-controlled-expansion";
const COMPONENT = "apps/frontend/src/components/parity/ParityTable.tsx";
const TESTS = "apps/frontend/src/components/parity/ParityTable.test.tsx";

function assertComponent(src) {
  const errors = [];
  // All three props OPTIONAL (the `?` is the 130-call-site safety line).
  if (!src.includes("expandedKeys?: string[]")) {
    errors.push(`${COMPONENT}: missing optional prop \`expandedKeys?: string[]\``);
  }
  if (!src.includes("onExpandedChange?: (keys: string[]) => void")) {
    errors.push(`${COMPONENT}: missing optional prop \`onExpandedChange?: (keys: string[]) => void\``);
  }
  if (!src.includes('expandMode?: "multi" | "single"')) {
    errors.push(`${COMPONENT}: missing optional prop \`expandMode?: "multi" | "single"\``);
  }
  // Default must remain current behavior: multi-expand.
  if (!src.includes('expandMode = "multi"')) {
    errors.push(`${COMPONENT}: expandMode must default to "multi" (current behavior)`);
  }
  // Controlled mode = presence of the notifier — the exact controlled-sort mirror.
  if (!/isExpandControlled\s*=\s*onExpandedChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled mode must be \`onExpandedChange != null\` (mirror isSortControlled)`);
  }
  // Uncontrolled internal Set must survive (default path for existing consumers).
  if (!/internalExpanded.*useState<Set<string>>\(new Set\(\)\)/.test(src)) {
    errors.push(`${COMPONENT}: internal uncontrolled expanded Set state must be preserved`);
  }
  // Single mode collapses others (applies to both modes).
  if (!src.includes('expandMode === "single"')) {
    errors.push(`${COMPONENT}: missing "single" expandMode collapse-others branch`);
  }
  // Controlled toggles must notify the owner, not mutate internal state.
  if (!src.includes("onExpandedChange?.(")) {
    errors.push(`${COMPONENT}: controlled toggle must fire onExpandedChange with the next keys`);
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
    "uncontrolled default is unchanged",
    "controlled mode: expandedKeys drives the open rows",
    'expandMode="single" (uncontrolled)',
    'expandMode="single" (controlled)',
  ];
  for (const name of required) {
    if (!src.includes(name)) {
      errors.push(`${TESTS}: missing controlled-expansion test: "${name}"`);
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
      expandMode?: "multi" | "single";
    };
    export function ParityTable({ onSortChange, onExpandedChange, expandMode = "multi" }) {
      const isSortControlled = onSortChange != null;
      const isExpandControlled = onExpandedChange != null;
      const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
      function toggleExpanded(id) {
        if (expandMode === "single") return new Set([id]);
        if (isExpandControlled) { onExpandedChange?.([id]); return; }
        setInternalExpanded((prev) => prev);
      }
    }
  `;
  const badComponent = `
    export function ParityTable() {
      const [expanded, setExpanded] = useState(new Set());
    }
  `;
  const goodTests = `
    it("uncontrolled default is unchanged: multi-expand keeps every expanded row open", () => {});
    it("controlled mode: expandedKeys drives the open rows; toggles fire onExpandedChange without mutating internally", () => {});
    it('expandMode="single" (uncontrolled): expanding one row collapses the other', () => {});
    it('expandMode="single" (controlled): onExpandedChange reports only the newly expanded key', () => {});
  `;
  const badTests = `it("renders rows", () => {});`;

  if (assertComponent(goodComponent).length) {
    console.error(`${LABEL} --selftest FAIL good component fixture:`, assertComponent(goodComponent));
    process.exit(1);
  }
  if (assertComponent(badComponent).length < 5) {
    console.error(`${LABEL} --selftest FAIL bad component fixture should fail hard`);
    process.exit(1);
  }
  if (assertTests(goodTests).length) {
    console.error(`${LABEL} --selftest FAIL good tests fixture:`, assertTests(goodTests));
    process.exit(1);
  }
  if (assertTests(badTests).length !== 4) {
    console.error(`${LABEL} --selftest FAIL bad tests fixture should miss all 4`);
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
    `OK ${LABEL}: ParityTable exposes optional expandedKeys/onExpandedChange/expandMode (default "multi"); uncontrolled internal Set preserved; controlled-sort mirror + unit coverage present.`,
  );
}

main();
