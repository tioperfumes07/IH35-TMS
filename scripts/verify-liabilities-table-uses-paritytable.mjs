#!/usr/bin/env node
/**
 * verify-liabilities-table-uses-paritytable — qbo-parity-a1 (LiabilitiesTable surface)
 *
 * Liabilities active-list table must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only surface (rows passed in
 * as props; no query/mutation in this component — the parent page owns error state).
 * Columns Display ID / Driver / Type / Source / Original $ / Paid $ / Balance $ /
 * Schedule / Status / Action preserved 1:1; $ toFixed(2) amount formatting, the
 * bold balance cell, the View Detail + Send Ack Request handlers, and the
 * empty-state message preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liabilities-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx";

const REQUIRED_LABELS = [
  "Display ID",
  "Driver",
  "Type",
  "Source",
  "Original $",
  "Paid $",
  "Balance $",
  "Schedule",
  "Status",
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
  if (!src.includes('storageKey="liabilities-table"')) {
    errors.push(`${PAGE}: must set storageKey="liabilities-table"`);
  }
  if (!src.includes('tableTestId="liabilities-table"')) {
    errors.push(`${PAGE}: must set tableTestId="liabilities-table"`);
  }
  if (!src.includes("No active liabilities.")) {
    errors.push(`${PAGE}: must keep empty-state message`);
  }
  for (const field of ["original_amount", "paid_to_date", "current_balance", "scheduled_deduction"]) {
    if (!src.includes(`\${Number(row.${field} ?? 0).toFixed(2)}`)) {
      errors.push(`${PAGE}: must keep $ toFixed(2) formatting for ${field}`);
    }
  }
  if (!src.includes("onOpenDetail(row)")) {
    errors.push(`${PAGE}: must keep View Detail handler (onOpenDetail)`);
  }
  if (!src.includes("onSendAck(row)")) {
    errors.push(`${PAGE}: must keep Send Ack Request handler (onSendAck)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "id", label: "Display ID" },
      { key: "driver_full_name", label: "Driver" },
      { key: "type", label: "Type" },
      { key: "source_description", label: "Source" },
      { key: "original_amount", label: "Original $", render: (row) => <>\${Number(row.original_amount ?? 0).toFixed(2)}</> },
      { key: "paid_to_date", label: "Paid $", render: (row) => <>\${Number(row.paid_to_date ?? 0).toFixed(2)}</> },
      { key: "current_balance", label: "Balance $", render: (row) => <>\${Number(row.current_balance ?? 0).toFixed(2)}</> },
      { key: "scheduled_deduction", label: "Schedule", render: (row) => <>\${Number(row.scheduled_deduction ?? 0).toFixed(2)}</> },
      { key: "display_status", label: "Status" },
      { key: "action", label: "Action", render: (row) => (
        <div>
          <button onClick={() => onOpenDetail(row)}>View Detail</button>
          <button onClick={() => onSendAck(row)}>Send Ack Request</button>
        </div>
      ) },
    ];
    <ParityTable
      storageKey="liabilities-table"
      tableTestId="liabilities-table"
      emptyText="No active liabilities."
    />
  `;
  const bad = `
    export function LiabilitiesTable() {
      return (
        <div>
          <table><thead><tr><th>Display ID</th></tr></thead></table>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; Display ID/Driver/Type/Source/Original $/Paid $/Balance $/Schedule/Status/Action preserved.`,
  );
}

main();
