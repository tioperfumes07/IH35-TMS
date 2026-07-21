#!/usr/bin/env node
/**
 * verify-paritytable-group-bands — ParityTable Phase A2 guard.
 *
 * Pins the ADDITIVE QBO-style group-band API on the shared ParityTable (`groupBy`),
 * modeled on the controlled-sort and A1 controlled-expansion precedents. The whole
 * prop must stay OPTIONAL so the ~130 existing call sites keep byte-identical
 * ungrouped behavior. Also pins:
 *  - stable grouping over the CURRENT page's rows (pagination math unchanged)
 *  - one full-width band <tr> (colSpan) per group via renderHeader
 *  - controlled collapse = presence of onCollapsedChange (mirror of isExpandControlled)
 *  - internal uncontrolled collapsed Set preserved
 *  - the ungrouped fallback path (pageRows → renderDataRow) preserved
 *  - unit coverage in ParityTable.test.tsx for omitted / bands / collapse / controlled.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-paritytable-group-bands";
const COMPONENT = "apps/frontend/src/components/parity/ParityTable.tsx";
const TESTS = "apps/frontend/src/components/parity/ParityTable.test.tsx";

function assertComponent(src) {
  const errors = [];
  // The whole prop OPTIONAL (the `?` is the 130-call-site safety line).
  if (!/groupBy\?:\s*\{/.test(src)) {
    errors.push(`${COMPONENT}: missing optional prop \`groupBy?: { ... }\``);
  }
  if (!src.includes("getKey: (row: T) => string")) {
    errors.push(`${COMPONENT}: groupBy missing required member \`getKey: (row: T) => string\``);
  }
  if (!src.includes("renderHeader: (key: string, rows: T[]) => ReactNode")) {
    errors.push(`${COMPONENT}: groupBy missing required member \`renderHeader: (key: string, rows: T[]) => ReactNode\``);
  }
  if (!src.includes("collapsible?: boolean")) {
    errors.push(`${COMPONENT}: groupBy missing optional member \`collapsible?: boolean\``);
  }
  if (!src.includes("collapsedKeys?: string[]")) {
    errors.push(`${COMPONENT}: groupBy missing optional member \`collapsedKeys?: string[]\``);
  }
  if (!src.includes("onCollapsedChange?: (keys: string[]) => void")) {
    errors.push(`${COMPONENT}: groupBy missing optional member \`onCollapsedChange?: (keys: string[]) => void\``);
  }
  // Controlled mode = presence of the notifier — the controlled-sort / A1 mirror.
  if (!/isCollapseControlled\s*=\s*groupBy\?\.onCollapsedChange\s*!=\s*null/.test(src)) {
    errors.push(`${COMPONENT}: controlled collapse must be \`groupBy?.onCollapsedChange != null\` (mirror isExpandControlled)`);
  }
  // Uncontrolled internal Set must survive (default collapse path).
  if (!/internalCollapsed.*useState<Set<string>>\(new Set\(\)\)/.test(src)) {
    errors.push(`${COMPONENT}: internal uncontrolled collapsed Set state must be preserved`);
  }
  // Controlled toggles must notify the owner, not mutate internal state.
  if (!src.includes("onCollapsedChange?.(")) {
    errors.push(`${COMPONENT}: controlled collapse toggle must fire onCollapsedChange with the next keys`);
  }
  // Bands span every rendered column (full-width band row).
  if (!/colSpan=\{colSpan\}/.test(src)) {
    errors.push(`${COMPONENT}: group band <td> must span all rendered columns via colSpan={colSpan}`);
  }
  // Grouping must be computed over the CURRENT page's rows (pagination math unchanged).
  if (!/groupedPageRows/.test(src) || !/for\s*\(const row of pageRows\)/.test(src)) {
    errors.push(`${COMPONENT}: groups must be computed over the current page's rows (groupedPageRows over pageRows)`);
  }
  // The ungrouped fallback path must be preserved for the ~130 existing call sites.
  if (!/pageRows\.map\(\(row\) => renderDataRow\(row\)\)/.test(src)) {
    errors.push(`${COMPONENT}: ungrouped fallback \`pageRows.map((row) => renderDataRow(row))\` must be preserved`);
  }
  // The precedents this API mirrors must still exist.
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
    "omitted groupBy = unchanged",
    "renders one full-width band per group",
    "collapsible: chevron toggle hides the group's rows",
    "controlled collapse: collapsedKeys drives hidden groups",
  ];
  for (const name of required) {
    if (!src.includes(name)) {
      errors.push(`${TESTS}: missing group-band test: "${name}"`);
    }
  }
  return errors;
}

function selftest() {
  const goodComponent = `
    export type ParityTableProps<T> = {
      onSortChange?: (key: string, direction: "asc" | "desc") => void;
      onExpandedChange?: (keys: string[]) => void;
      groupBy?: {
        getKey: (row: T) => string;
        renderHeader: (key: string, rows: T[]) => ReactNode;
        collapsible?: boolean;
        collapsedKeys?: string[];
        onCollapsedChange?: (keys: string[]) => void;
      };
    };
    export function ParityTable({ onSortChange, onExpandedChange, groupBy }) {
      const isSortControlled = onSortChange != null;
      const isExpandControlled = onExpandedChange != null;
      const isCollapseControlled = groupBy?.onCollapsedChange != null;
      const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(new Set());
      const groupedPageRows = useMemo(() => {
        for (const row of pageRows) {}
      }, []);
      function toggleGroupCollapsed(key) {
        if (isCollapseControlled) { groupBy?.onCollapsedChange?.([key]); return; }
        setInternalCollapsed((prev) => prev);
      }
      return groupBy ? <td colSpan={colSpan} /> : pageRows.map((row) => renderDataRow(row));
    }
  `;
  const badComponent = `
    export function ParityTable() {
      const [expanded, setExpanded] = useState(new Set());
    }
  `;
  const goodTests = `
    it("omitted groupBy = unchanged: no band rows, plain row list", () => {});
    it("renders one full-width band per group with the group's rows beneath it, order preserved", () => {});
    it("collapsible: chevron toggle hides the group's rows (uncontrolled), band stays visible", () => {});
    it("controlled collapse: collapsedKeys drives hidden groups; toggles fire onCollapsedChange without mutating internally", () => {});
  `;
  const badTests = `it("renders rows", () => {});`;

  if (assertComponent(goodComponent).length) {
    console.error(`${LABEL} --selftest FAIL good component fixture:`, assertComponent(goodComponent));
    process.exit(1);
  }
  if (assertComponent(badComponent).length < 10) {
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
    `OK ${LABEL}: ParityTable exposes optional groupBy band prop (getKey/renderHeader/collapsible/collapsedKeys/onCollapsedChange); current-page stable grouping, colSpan bands, controlled/uncontrolled collapse mirrors, ungrouped fallback + unit coverage present.`,
  );
}

main();
