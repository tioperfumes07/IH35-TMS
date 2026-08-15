#!/usr/bin/env node
/**
 * verify-revenue-recognition-page-uses-paritytable — qbo-parity (RevenueRecognitionPage)
 *
 * The ASC 606 revenue-contracts list AND the ObligationBlock schedule leaf must use
 * ParityTable (Search+Range+gear), not hand-rolled <table>. ACCT-F3570 closed the
 * retained-modal-schedule carve-out: zero raw HTML tables remain on this page.
 * Display-only: detail-open stays in a cell renderer; server offset pager preserved;
 * load failures surface ListErrorState (never a silent false-empty).
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
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (contracts list + obligation schedule)`);
  }
  if (/<table\b/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <table> (ACCT-F3570 — schedule is ParityTable)`);
  }
  if (!src.includes("revenue-obligation-schedule-")) {
    errors.push(`${PAGE}: ObligationBlock schedule must use revenue-obligation-schedule- storageKey/testId`);
  }
  if (!src.includes("function ObligationBlock")) {
    errors.push(`${PAGE}: must keep ObligationBlock`);
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
        <ParityTable storageKey={\`revenue-obligation-schedule-\${ob.obligation_number}\`} tableTestId={\`revenue-obligation-schedule-\${ob.obligation_number}\`} />
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
    function ObligationBlock() {
      return <table><thead><tr><th>Period</th></tr></thead></table>;
    }
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
  console.log(`OK ${LABEL}: ${PAGE} contracts + obligation schedule use ParityTable; zero raw tables; pager + detail action preserved.`);
}

main();
