#!/usr/bin/env node
/**
 * verify-liability-breakdown-modal-uses-paritytable — driver-finance Liability Breakdown modal
 *
 * The Liability Breakdown modal grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Financial surface — owner-greenlit
 * DISPLAY-ONLY migration of a READ-ONLY props-fed breakdown grid (no mutation, no
 * posting, no query). Columns Type / Source / Original / Paid / Balance / Schedule,
 * the canonical formatUsdTable amount formatting, the TOTAL ACTIVE / EXCLUDING PENDING ACK
 * totals footer, and the pending-ack recompute note must be preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liability-breakdown-modal-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx";

const REQUIRED_LABELS = ["Type", "Source", "Original", "Paid", "Balance", "Schedule"];

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
  if (!src.includes('storageKey="driver-finance-liability-breakdown"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-liability-breakdown"`);
  }
  if (!src.includes('tableTestId="driver-finance-liability-breakdown-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-finance-liability-breakdown-table"`);
  }
  // ACCT-F9799 (2026-10-02) moved every driver-finance money cell to the canonical formatter: a real amount renders
  // as accounting dollars, a missing one as "—" (owner design law: never 0, never -$0.00). `$` + toFixed(2) printed
  // "$0.00" / "$NaN" for a missing value, so the canonical formatter is the stricter rule this guard now pins.
  for (const amount of ["original", "paid", "balance"]) {
    if (!src.includes(`formatUsdTable(item.${amount})`)) {
      errors.push(`${PAGE}: must format ${amount} with the canonical formatUsdTable(item.${amount}) (missing renders "—")`);
    }
  }
  if (!src.includes("TOTAL ACTIVE:")) {
    errors.push(`${PAGE}: must keep the "TOTAL ACTIVE" totals footer`);
  }
  if (!src.includes("EXCLUDING PENDING ACK:")) {
    errors.push(`${PAGE}: must keep the "EXCLUDING PENDING ACK" totals footer`);
  }
  if (!src.includes("excludes pending-ack liabilities")) {
    errors.push(`${PAGE}: must keep the pending-ack recompute note`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "type", label: "Type" },
      { key: "source_description", label: "Source" },
      { key: "original", label: "Original", render: (item) => formatUsdTable(item.original) },
      { key: "paid", label: "Paid", render: (item) => formatUsdTable(item.paid) },
      { key: "balance", label: "Balance", render: (item) => formatUsdTable(item.balance) },
      { key: "schedule", label: "Schedule" },
    ];
    <ParityTable
      storageKey="driver-finance-liability-breakdown"
      tableTestId="driver-finance-liability-breakdown-table"
    />
    <div>TOTAL ACTIVE: <span>x</span></div>
    <div>EXCLUDING PENDING ACK: <span>y</span></div>
    <div>Settlement detail uses live recompute authority and excludes pending-ack liabilities from active debt display.</div>
  `;
  const bad = `
    export function LiabilityBreakdownModal() {
      return (
        <div>
          <table><thead><tr><th>Type</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + amount formatting + totals footer preserved.`);
}

main();
