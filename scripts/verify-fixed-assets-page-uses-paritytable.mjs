#!/usr/bin/env node
/**
 * verify-fixed-assets-page-uses-paritytable — qbo-parity (FixedAssetsPage)
 *
 * The fixed-asset register list must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only migration: the
 * detail-open button stays inside a cell renderer, the server-side offset pager
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
  if (!src.includes("setDetailId(row.id)")) {
    errors.push(`${PAGE}: must keep the detail-open button inside a cell renderer`);
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
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
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
