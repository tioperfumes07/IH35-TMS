#!/usr/bin/env node
/**
 * verify-driver-escrow-tab-content-uses-paritytable — qbo-parity (Driver Escrow ledger surface)
 *
 * Driver escrow is a LIABILITY money surface — the ledger table is display-only and must use the
 * shared ParityTable grammar, not a hand-rolled <table>. Display-only migration: the column
 * grammar (Date / Description / Deposits / Withdrawals / Status / Category), the $X.XX amount
 * formatting with the em-dash zero placeholder, the deposits-slate / withdrawals-red sign
 * colors, the Doc-18 defect #12 driver drill-through, and the settled-only empty text must all
 * be preserved. Ledger outages surface ListErrorBanner. This surface posts nothing and must stay
 * that way (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-escrow-tab-content-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx";

const COLUMN_LABELS = ["Date", "Description", "Deposits", "Withdrawals", "Status", "Category"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!/<ParityTable\b/.test(src)) {
    errors.push(`${PAGE}: must render <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of COLUMN_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="banking-driver-escrow-ledger"')) {
    errors.push(`${PAGE}: must set storageKey="banking-driver-escrow-ledger"`);
  }
  if (!src.includes("No escrow ledger rows found for this filter.")) {
    errors.push(`${PAGE}: must keep the escrow-ledger emptyText`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must render ListErrorBanner on escrow-ledger load failure`);
  }
  if (!src.includes(".toFixed(2)")) {
    errors.push(`${PAGE}: must keep the $X.XX two-decimal amount formatting`);
  }
  if (!src.includes("/drivers/")) {
    errors.push(`${PAGE}: must keep the Doc-18 defect #12 driver drill-through`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only liability ledger surface — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
    const columns = [
      { key: "txn_date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "deposits", label: "Deposits", render: (row) => (Number(row.deposits ?? 0) > 0 ? \`$\${Number(row.deposits ?? 0).toFixed(2)}\` : "—") },
      { key: "withdrawals", label: "Withdrawals" },
      { key: "status", label: "Status" },
      { key: "category", label: "Category" },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable
      storageKey="banking-driver-escrow-ledger"
      emptyText="No escrow ledger rows found for this filter."
      onRowClick={(row) => navigate(\`/drivers/\${row.driver_id}\`)}
    />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function DriverEscrowTabContent() {
      return (
        <table className="min-w-[1050px]">
          <thead><tr><th>Date</th></tr></thead>
        </table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/formatting/drill-through preserved; display-only.`);
}

main();
