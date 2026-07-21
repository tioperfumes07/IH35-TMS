#!/usr/bin/env node
/**
 * verify-settlement-disputes-uses-paritytable — qbo-parity-a1 (SettlementDisputesTab list surface)
 *
 * Driver-finance Settlement Disputes list must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. DISPLAY-ONLY migration on a financial
 * surface: the dispute mutations (review/resolve) live in the detail panel and are
 * untouched; the list's Open action handler, money() cents formatting, status badge,
 * column order Driver Name / Settlement Period / Category / Description / Disputed
 * Amount / Status / Opened / Actions, and the empty-filter message are preserved 1:1.
 * ListErrorState renders on query error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-disputes-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx";

const REQUIRED_LABELS = [
  "Driver Name",
  "Settlement Period",
  "Category",
  "Description",
  "Disputed Amount",
  "Status",
  "Opened",
  "Actions",
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
  if (!src.includes('storageKey="settlement-disputes"')) {
    errors.push(`${PAGE}: must set storageKey="settlement-disputes"`);
  }
  if (!src.includes('tableTestId="settlement-disputes-table"')) {
    errors.push(`${PAGE}: must set tableTestId="settlement-disputes-table"`);
  }
  if (!src.includes("No disputes found for current filter.")) {
    errors.push(`${PAGE}: must keep empty-filter message`);
  }
  if (!src.includes("money(row.disputed_amount_cents)")) {
    errors.push(`${PAGE}: must keep money() cents formatting for the Disputed Amount column`);
  }
  if (!src.includes("statusBadgeClass(row.status)")) {
    errors.push(`${PAGE}: must keep the status badge rendering`);
  }
  if ((src.match(/<ListErrorState\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ListErrorState on disputes query error`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "driver_name", label: "Driver Name" },
      { key: "period_start", label: "Settlement Period" },
      { key: "dispute_category", label: "Category" },
      { key: "dispute_description", label: "Description" },
      { key: "disputed_amount_cents", label: "Disputed Amount", render: (row) => money(row.disputed_amount_cents) },
      { key: "status", label: "Status", render: (row) => <span className={statusBadgeClass(row.status)}>{row.status}</span> },
      { key: "opened_at", label: "Opened" },
      { key: "actions", label: "Actions" },
    ];
    {isError ? (
      <ListErrorState title="Couldn't load disputes" status={0} onRetry={() => {}} />
    ) : (
      <ParityTable
        storageKey="settlement-disputes"
        tableTestId="settlement-disputes-table"
        emptyText="No disputes found for current filter."
      />
    )}
  `;
  const bad = `
    export function SettlementDisputesTab() {
      return (
        <div>
          <table><thead><tr><th>Driver Name</th></tr></thead></table>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; Driver Name/Settlement Period/Category/Description/Disputed Amount/Status/Opened/Actions preserved.`,
  );
}

main();
