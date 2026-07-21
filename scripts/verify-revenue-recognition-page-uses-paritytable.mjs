#!/usr/bin/env node
/**
 * verify-revenue-recognition-page-uses-paritytable — qbo-parity (RevenueRecognitionPage)
 *
 * The ASC 606 revenue-contracts list must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only migration: the
 * detail-open button stays inside a cell renderer, the server-side offset pager
 * (Prev/Next) is preserved, and load failures surface ListErrorState (never a
 * silent false-empty). The ONE small read-only schedule table inside the
 * ObligationBlock detail-modal card is explicitly retained (FixedAssetsPage
 * precedent — no gear/pager chrome or card-in-card inside the modal); the page
 * section (RevenueRecognitionPage function) must contain NO hand-rolled table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-revenue-recognition-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx";

const COLUMN_LABELS = [
  "Description",
  "Source",
  "Date",
  "Price",
  "Recognized",
  "Deferred",
  "Obligations",
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
    errors.push(`${PAGE}: expected ≥1 <ParityTable> (revenue-contracts list)`);
  }
  // The list section (page component) must have no hand-rolled table. The single
  // retained <table> is the read-only per-obligation schedule inside ObligationBlock
  // (detail modal) — allowed, and it must stay the ONLY one.
  const pageStart = src.indexOf("export function RevenueRecognitionPage");
  if (pageStart === -1) {
    errors.push(`${PAGE}: expected export function RevenueRecognitionPage`);
  } else {
    const listSection = src.slice(pageStart);
    if (/<table[\s>]/.test(listSection) || /<thead[\s>]/.test(listSection)) {
      errors.push(`${PAGE}: RevenueRecognitionPage must not contain a hand-rolled <table>/<thead>`);
    }
  }
  const tableCount = (src.match(/<table[\s>]/g) ?? []).length;
  if (tableCount > 1) {
    errors.push(`${PAGE}: at most ONE retained <table> allowed (ObligationBlock modal schedule); found ${tableCount}`);
  }
  if (tableCount === 1) {
    const obligationStart = src.indexOf("function ObligationBlock");
    const obligationEnd = src.indexOf("function DetailPanel");
    const tableIdx = src.search(/<table[\s>]/);
    if (obligationStart === -1 || obligationEnd === -1 || tableIdx < obligationStart || tableIdx > obligationEnd) {
      errors.push(`${PAGE}: the retained <table> must live inside ObligationBlock (detail-modal schedule)`);
    }
  }
  for (const label of COLUMN_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="revenue-recognition-contracts"')) {
    errors.push(`${PAGE}: must set storageKey="revenue-recognition-contracts"`);
  }
  if (!src.includes('tableTestId="revenue-recognition-contracts-table"')) {
    errors.push(`${PAGE}: must set tableTestId="revenue-recognition-contracts-table"`);
  }
  if (!src.includes('emptyText="No revenue contracts found."')) {
    errors.push(`${PAGE}: must keep emptyText="No revenue contracts found." (verify-list-empty-settled)`);
  }
  if (!src.includes("Failed to load revenue contracts.")) {
    errors.push(`${PAGE}: must keep ListErrorState title for contracts load failure`);
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
    function ObligationBlock({ ob }) {
      return (
        <table className="min-w-full"><thead><tr><th>Period</th></tr></thead></table>
      );
    }
    function DetailPanel() { return null; }
    export function RevenueRecognitionPage() {
      const columns = [
        { key: "contract_number", label: "#" },
        { key: "description", label: "Description", render: (row) => <button onClick={() => setDetailId(row.id)}>x</button> },
        { key: "source_type", label: "Source" },
        { key: "contract_date", label: "Date" },
        { key: "transaction_price_cents", label: "Price" },
        { key: "recognized_to_date_cents", label: "Recognized" },
        { key: "deferred_balance_cents", label: "Deferred" },
        { key: "obligation_count", label: "Obligations" },
        { key: "status", label: "Status" },
      ];
      return (
        <div>
          <ListErrorState title="Failed to load revenue contracts." status={0} onRetry={() => {}} />
          <ParityTable storageKey="revenue-recognition-contracts" tableTestId="revenue-recognition-contracts-table" emptyText="No revenue contracts found." />
          <button onClick={() => setOffset(0)}>Prev</button>
        </div>
      );
    }
  `;
  const bad = `
    function ObligationBlock() { return null; }
    function DetailPanel() { return null; }
    export function RevenueRecognitionPage() {
      return (
        <div>
          <table><thead><tr><th>Description</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} contracts list uses ParityTable + ListErrorState; modal schedule table retained; pager + detail action preserved.`);
}

main();
