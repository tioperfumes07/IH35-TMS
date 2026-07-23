#!/usr/bin/env node
/**
 * verify-fixed-assets-page-uses-paritytable — qbo-parity (FixedAssetsPage)
 *
 * The fixed-asset register list must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only migration: the
 * detail-open button stays inside a cell renderer (asserted structurally — the
 * button must live in the ParityColumn array and its handler must reach
 * setDetailId; the handler's NAME is deliberately not pinned), the server-side offset pager
 * (Prev/Next) is preserved, and load failures surface ListErrorState (never a
 * silent false-empty). The ONE small read-only depreciation-schedule table inside
 * the DetailPanel modal is explicitly retained (this page IS the precedent the
 * RevenueRecognition ObligationBlock guard, verify-step 1146, cites — no
 * gear/pager chrome or card-in-card inside the modal); the page section
 * (FixedAssetsPage function) must contain NO hand-rolled table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fixed-assets-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx";

const COLUMN_LABELS = [
  "Name",
  "Class",
  "In Service",
  "Method",
  "Cost",
  "Depr. to date",
  "Net Book Value",
  "Owner",
  "Status",
];

/** Slice the `const columns = ...[ ... ]` array literal (bracket-balanced). */
function extractColumnsBlock(src) {
  const decl = src.search(/const\s+columns\s*[:=]/);
  if (decl === -1) return null;
  // Skip generic type args such as useMemo<ParityColumn<T>[]>( — the array literal
  // starts at the first "[" that directly follows "=" or "=>".
  const opener = /(?:=>|=)\s*\[/.exec(src.slice(decl));
  if (!opener) return null;
  const start = decl + opener.index + opener[0].length - 1;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Slice the body of `const <name> = (...) => { ... }` / `function <name>(...) { ... }`.
 * Brace-balanced so a LATER function (e.g. closeDetail) can never satisfy an
 * assertion about THIS one. Returns null when the handler is not declared.
 */
function extractHandlerBody(src, name) {
  const decl = new RegExp(`(?:const|let|function)\\s+${name}\\b`).exec(src);
  if (!decl) return null;
  const from = decl.index;
  const arrow = src.indexOf("=>", from);
  const blockStart = src.indexOf("{", from);
  // Arrow with a bare-expression body: `const f = (id) => setDetailId(id);`
  if (arrow !== -1 && (blockStart === -1 || blockStart > arrow)) {
    const rest = src.slice(arrow + 2);
    if (!/^\s*\{/.test(rest)) return rest.slice(0, rest.indexOf(";") + 1 || 200);
  }
  if (blockStart === -1) return null;
  let depth = 0;
  for (let i = blockStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(blockStart, i + 1);
    }
  }
  return null;
}

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable> (fixed-asset register list)`);
  }
  // The list section (page component) must have no hand-rolled table. The single
  // retained <table> is the read-only depreciation schedule inside DetailPanel
  // (detail modal) — allowed, and it must stay the ONLY one.
  const pageStart = src.indexOf("export function FixedAssetsPage");
  if (pageStart === -1) {
    errors.push(`${PAGE}: expected export function FixedAssetsPage`);
  } else {
    const listSection = src.slice(pageStart);
    if (/<table[\s>]/.test(listSection) || /<thead[\s>]/.test(listSection)) {
      errors.push(`${PAGE}: FixedAssetsPage must not contain a hand-rolled <table>/<thead>`);
    }
  }
  const tableCount = (src.match(/<table[\s>]/g) ?? []).length;
  if (tableCount > 1) {
    errors.push(`${PAGE}: at most ONE retained <table> allowed (DetailPanel modal depreciation schedule); found ${tableCount}`);
  }
  if (tableCount === 1) {
    const detailStart = src.indexOf("function DetailPanel");
    const detailEnd = src.indexOf("export function FixedAssetsPage");
    const tableIdx = src.search(/<table[\s>]/);
    if (detailStart === -1 || detailEnd === -1 || tableIdx < detailStart || tableIdx > detailEnd) {
      errors.push(`${PAGE}: the retained <table> must live inside DetailPanel (modal depreciation schedule)`);
    }
  }
  for (const label of COLUMN_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="fixed-assets-list"')) {
    errors.push(`${PAGE}: must set storageKey="fixed-assets-list"`);
  }
  if (!src.includes('tableTestId="fixed-assets-table"')) {
    errors.push(`${PAGE}: must set tableTestId="fixed-assets-table"`);
  }
  if (!src.includes('emptyText="No fixed assets found."')) {
    errors.push(`${PAGE}: must keep emptyText="No fixed assets found." (verify-list-empty-settled)`);
  }
  if (!src.includes("Failed to load fixed assets.")) {
    errors.push(`${PAGE}: must keep ListErrorState title for fixed-assets load failure`);
  }
  // Detail-open action must remain inside a cell renderer; server offset pager preserved.
  // Structural (not name-pinned): the button must live inside the ParityColumn
  // definitions and its onClick must call a handler with row.id, and that handler
  // must actually open the detail panel (setDetailId) — a renamed no-op still fails.
  const columnsBlock = extractColumnsBlock(src);
  if (!columnsBlock) {
    errors.push(`${PAGE}: expected a columns array of ParityColumn definitions`);
  } else {
    const openMatch = columnsBlock.match(/<button[^>]*onClick=\{\(\)\s*=>\s*(\w+)\(row\.id\)\}/);
    if (!openMatch) {
      errors.push(
        `${PAGE}: must keep the detail-open button inside a cell renderer (<button onClick={() => <handler>(row.id)}>)`,
      );
    } else {
      const handler = openMatch[1];
      if (handler !== "setDetailId") {
        const body = extractHandlerBody(src, handler);
        if (!body || !body.includes("setDetailId(")) {
          errors.push(`${PAGE}: detail-open handler ${handler}() must set the detail state (setDetailId)`);
        }
      }
    }
  }
  if (!src.includes("setOffset(")) {
    errors.push(`${PAGE}: must preserve the server-side offset pager (Prev/Next)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    function DetailPanel({ detail }) {
      return (
        <table className="min-w-full"><thead><tr><th>Period</th></tr></thead></table>
      );
    }
    export function FixedAssetsPage() {
      const columns = [
        { key: "asset_number", label: "#" },
        { key: "name", label: "Name", render: (row) => <button onClick={() => setDetailId(row.id)}>x</button> },
        { key: "class_name", label: "Class" },
        { key: "in_service_date", label: "In Service" },
        { key: "method", label: "Method" },
        { key: "purchase_price_cents", label: "Cost" },
        { key: "depreciation_to_date_cents", label: "Depr. to date" },
        { key: "net_book_value_cents", label: "Net Book Value" },
        { key: "owner_company_name", label: "Owner" },
        { key: "status", label: "Status" },
      ];
      return (
        <div>
          <ListErrorState title="Failed to load fixed assets." status={0} onRetry={() => {}} />
          <ParityTable storageKey="fixed-assets-list" tableTestId="fixed-assets-table" emptyText="No fixed assets found." />
          <button onClick={() => setOffset(0)}>Prev</button>
        </div>
      );
    }
  `;
  const bad = `
    function DetailPanel() { return null; }
    export function FixedAssetsPage() {
      return (
        <div>
          <table><thead><tr><th>Name</th></tr></thead></table>
        </div>
      );
    }
  `;
  // Renamed opener that really opens the detail panel — must PASS (name not pinned).
  const renamed = good
    .replace("export function FixedAssetsPage() {", "export function FixedAssetsPage() {\n      const openDetail = (id) => { setDetailId(id); setSearchParams(id); };")
    .replace("setDetailId(row.id)", "openDetail(row.id)");
  // Renamed opener that does NOT touch detail state — must still FAIL.
  const renamedNoop = good
    .replace("export function FixedAssetsPage() {", "export function FixedAssetsPage() {\n      const openDetail = (id) => { console.log(id); };")
    .replace("setDetailId(row.id)", "openDetail(row.id)");
  // Detail-open button moved OUT of the cell renderers — must still FAIL.
  const outsideRenderer = good.replace(
    '{ key: "name", label: "Name", render: (row) => <button onClick={() => setDetailId(row.id)}>x</button> },',
    '{ key: "name", label: "Name" },',
  );
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  const renamedErrors = assertMigrated(renamed);
  const renamedNoopErrors = assertMigrated(renamedNoop);
  const outsideRendererErrors = assertMigrated(outsideRenderer);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (renamedErrors.length) {
    console.error(`${LABEL} --selftest FAIL renamed-opener fixture (handler name must not be pinned):`, renamedErrors);
    process.exit(1);
  }
  if (!renamedNoopErrors.some((e) => e.includes("must set the detail state"))) {
    console.error(`${LABEL} --selftest FAIL: a renamed no-op opener must be rejected`, renamedNoopErrors);
    process.exit(1);
  }
  if (!outsideRendererErrors.some((e) => e.includes("inside a cell renderer"))) {
    console.error(`${LABEL} --selftest FAIL: detail-open button outside a cell renderer must be rejected`, outsideRendererErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} register list uses ParityTable + ListErrorState; modal depreciation-schedule table retained; pager + detail action preserved.`);
}

main();
