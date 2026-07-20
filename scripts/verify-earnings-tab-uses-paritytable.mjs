#!/usr/bin/env node
/**
 * verify-earnings-tab-uses-paritytable — qbo-parity-a1 (EarningsTab surface)
 *
 * Drivers → Earnings/Debt tab must use shared ParityTable grammar (sort/resize/gear),
 * not hand-rolled <table>. Preserves pre-migration columns + row testids.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-earnings-tab-uses-paritytable";
const PAGE = "apps/frontend/src/components/drivers/EarningsTab.tsx";

const REQUIRED_SETTLEMENT_LABELS = ["Period", "Gross", "Deductions", "Net pay", "Status"];
const REQUIRED_LIABILITY_LABELS = ["Type", "Source", "Original", "Paid", "Balance", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> surfaces (settlements + liabilities), found ${parityUses}`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_SETTLEMENT_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing settlement column label: "${label}"`);
    }
  }
  for (const label of REQUIRED_LIABILITY_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing liability column label: "${label}"`);
    }
  }
  if (!src.includes("driver-earnings-settlement-")) {
    errors.push(`${PAGE}: must preserve rowTestId prefix driver-earnings-settlement-`);
  }
  if (!src.includes("driver-earnings-liability-")) {
    errors.push(`${PAGE}: must preserve rowTestId prefix driver-earnings-liability-`);
  }
  if (!src.includes("No settlements for this driver yet.")) {
    errors.push(`${PAGE}: must keep settlements emptyText`);
  }
  if (!src.includes("No active liabilities for this driver.")) {
    errors.push(`${PAGE}: must keep liabilities emptyText`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const SETTLEMENT_COLUMNS = [
      { key: "period", label: "Period" },
      { key: "gross_pay", label: "Gross" },
      { key: "deductions_total", label: "Deductions" },
      { key: "net_pay", label: "Net pay" },
      { key: "status", label: "Status" },
    ];
    const LIABILITY_COLUMNS = [
      { key: "type", label: "Type" },
      { key: "source_description", label: "Source" },
      { key: "original_amount", label: "Original" },
      { key: "paid_to_date", label: "Paid" },
      { key: "current_balance", label: "Balance" },
      { key: "status", label: "Status" },
    ];
    <ParityTable emptyText="No settlements for this driver yet." rowTestId={(row) => \`driver-earnings-settlement-\${row.id}\`} />
    <ParityTable emptyText="No active liabilities for this driver." rowTestId={(row) => \`driver-earnings-liability-\${String(row.id)}\`} />
  `;
  const bad = `
    <table className="min-w-[720px]">
      <thead><tr><th>Period</th></tr></thead>
    </table>
  `;
  if (assertMigrated(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    process.exit(1);
  }
  if (!assertMigrated(bad).some((e) => e.includes("hand-rolled") || e.includes("ParityTable"))) {
    console.error(`${LABEL} SELFTEST FAILED — bad fixture not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const errors = assertMigrated(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — EarningsTab uses ParityTable (settlements + liabilities)`);
process.exit(0);

