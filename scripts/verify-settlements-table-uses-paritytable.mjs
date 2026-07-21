#!/usr/bin/env node
/**
 * verify-settlements-table-uses-paritytable — qbo-parity-a1 (SettlementsTable surface)
 *
 * Driver-finance settlements list must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Financial surface, DISPLAY-ONLY
 * migration (rows passed in as props; no query/mutation in this component — the
 * parent page owns data + error state; the Open → handler is untouched).
 * Columns Driver / Period / Loads / Gross / Deductions / Net Pay / Status /
 * Debt Flag / Action preserved 1:1; $ + toFixed(2) amount formatting, status pill,
 * red debt-flag highlight, URL-persisted sort (useUrlSort), and the empty message
 * preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";

const REQUIRED_LABELS = [
  "Driver",
  "Period",
  "Loads",
  "Gross",
  "Deductions",
  "Net Pay",
  "Status",
  "Debt Flag",
  "Action",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="driver-finance-settlements"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-settlements"`);
  }
  if (!src.includes('tableTestId="settlements-table"')) {
    errors.push(`${PAGE}: must set tableTestId="settlements-table"`);
  }
  if (!src.includes("No settlements found.")) {
    errors.push(`${PAGE}: must keep empty message "No settlements found."`);
  }
  if (!src.includes("Number(row.gross_pay ?? 0).toFixed(2)")) {
    errors.push(`${PAGE}: must keep $ + toFixed(2) gross formatting`);
  }
  if (!src.includes("Number(row.deductions_total ?? 0).toFixed(2)")) {
    errors.push(`${PAGE}: must keep $ + toFixed(2) deductions formatting`);
  }
  if (!src.includes("Number(row.net_pay ?? 0).toFixed(2)")) {
    errors.push(`${PAGE}: must keep $ + toFixed(2) net-pay formatting`);
  }
  if (!src.includes("row.live_debt_flag.toFixed(2)")) {
    errors.push(`${PAGE}: must keep red debt-flag $ rendering`);
  }
  if (!src.includes("onOpen(row.id)")) {
    errors.push(`${PAGE}: must keep the Open → onOpen(row.id) action handler`);
  }
  if (!src.includes("useUrlSort")) {
    errors.push(`${PAGE}: must keep URL-persisted sort via useUrlSort`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { useUrlSort } from "../../../hooks/useUrlSort";
    const COLUMNS = [
      { key: "driver", label: "Driver" },
      { key: "period", label: "Period" },
      { key: "loads", label: "Loads" },
      { key: "gross", label: "Gross", render: (row) => <>{"$"}{Number(row.gross_pay ?? 0).toFixed(2)}</> },
      { key: "deductions", label: "Deductions", render: (row) => <>{"$"}{Number(row.deductions_total ?? 0).toFixed(2)}</> },
      { key: "net_pay", label: "Net Pay", render: (row) => <>{"$"}{Number(row.net_pay ?? 0).toFixed(2)}</> },
      { key: "status", label: "Status" },
      { key: "debt_flag", label: "Debt Flag", render: (row) => <span>{"$"}{row.live_debt_flag.toFixed(2)}</span> },
      { key: "action", label: "Action", render: (row) => <button onClick={() => onOpen(row.id)}>Open →</button> },
    ];
    const { sortKey } = useUrlSort();
    <ParityTable
      storageKey="driver-finance-settlements"
      tableTestId="settlements-table"
      emptyText="No settlements found."
    />
  `;
  const bad = `
    export function SettlementsTable() {
      return (
        <div>
          <table><thead><tr><th>Driver</th></tr></thead></table>
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
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable; Driver/Period/Loads/Gross/Deductions/Net Pay/Status/Debt Flag/Action preserved.`,
  );
}

main();
