#!/usr/bin/env node
/**
 * verify-escrow-deductions-pending-uses-paritytable — qbo-parity-a1 (Driver Finance › Escrow
 * Deductions Pending Review surface)
 *
 * FINANCIAL SURFACE — display-only migration (owner greenlit UI-only). The pending escrow
 * deductions list must use shared ParityTable grammar (sort/resize/gear), not a hand-rolled
 * <table>. Columns Driver Name / Load # / Proposed Amount / Reason / Proposed At / Expires At /
 * Actions preserved in order; formatMoney (formatUsdCents) amount rendering, near-expiry
 * red highlight, the Review action button, the empty-state copy, and ListErrorState on query
 * error are all required. No posting/mutation logic may change (guarded here only at the
 * render layer; the approve/reject mutations stay in the page).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-deductions-pending-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx";

const REQUIRED_LABELS = [
  "Driver Name",
  "Load #",
  "Proposed Amount",
  "Reason",
  "Proposed At",
  "Expires At",
  "Actions",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
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
  if (!src.includes('storageKey="escrow-deductions-pending"')) {
    errors.push(`${PAGE}: must set storageKey="escrow-deductions-pending"`);
  }
  if (!src.includes('tableTestId="escrow-deductions-pending-table"')) {
    errors.push(`${PAGE}: must set tableTestId="escrow-deductions-pending-table"`);
  }
  if (!src.includes("No pending escrow deductions")) {
    errors.push(`${PAGE}: must keep the "No pending escrow deductions" empty-state copy`);
  }
  if (!src.includes("formatMoney(row.proposed_amount_cents)")) {
    errors.push(`${PAGE}: must keep formatMoney(row.proposed_amount_cents) amount rendering (display parity)`);
  }
  if (!src.includes("font-semibold text-red-600")) {
    errors.push(`${PAGE}: must keep the near-expiry red highlight on Expires At`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes(">Review<") && !/>\s*Review\s*</.test(src)) {
    errors.push(`${PAGE}: must keep the Review action button`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "driver_name", label: "Driver Name" },
      { key: "load_number", label: "Load #" },
      { key: "proposed_amount_cents", label: "Proposed Amount", render: (row) => formatMoney(row.proposed_amount_cents) },
      { key: "proposed_reason", label: "Reason" },
      { key: "proposed_at", label: "Proposed At" },
      { key: "expires_at", label: "Expires At", render: (row) => <span className="font-semibold text-red-600">x</span> },
      { key: "actions", label: "Actions", render: () => <Button>Review</Button> },
    ];
    <ParityTable
      storageKey="escrow-deductions-pending"
      tableTestId="escrow-deductions-pending-table"
      emptyText="No pending escrow deductions"
    />
  `;
  const bad = `
    export function EscrowDeductionsPendingTab() {
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns, amount rendering + empty copy preserved.`);
}

main();
