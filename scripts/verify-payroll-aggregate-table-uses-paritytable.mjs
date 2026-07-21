#!/usr/bin/env node
/**
 * verify-payroll-aggregate-table-uses-paritytable — qbo-parity-a1 (PayrollAggregateTable surface)
 *
 * Payroll-integration by-person aggregate table must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only surface (persons passed in
 * as props; no query/mutation in this component — the parent page owns error state).
 * Columns Person / Type / Class / Gross / Deductions / Net preserved 1:1; cents formatting,
 * deduction minus sign, and the empty-period message preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payroll-aggregate-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/payroll-integration/PayrollAggregateTable.tsx";

const REQUIRED_LABELS = ["Person", "Type", "Class", "Gross", "Deductions", "Net"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
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
  if (!src.includes('storageKey="payroll-aggregate"')) {
    errors.push(`${PAGE}: must set storageKey="payroll-aggregate"`);
  }
  if (!src.includes('tableTestId="payroll-aggregate-table"')) {
    errors.push(`${PAGE}: must set tableTestId="payroll-aggregate-table"`);
  }
  if (!src.includes("No payroll records for this period.")) {
    errors.push(`${PAGE}: must keep empty-period message`);
  }
  if (!src.includes("−{cents(p.deductions_cents)}")) {
    errors.push(`${PAGE}: must keep minus-sign deduction rendering (−cents)`);
  }
  if (!src.includes("cents(p.gross_cents)") || !src.includes("cents(p.net_cents)")) {
    errors.push(`${PAGE}: must keep cents() formatting for gross + net`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "person_name", label: "Person" },
      { key: "pay_type", label: "Type" },
      { key: "class", label: "Class" },
      { key: "gross_cents", label: "Gross", render: (p) => <span>{cents(p.gross_cents)}</span> },
      { key: "deductions_cents", label: "Deductions", render: (p) => <span>−{cents(p.deductions_cents)}</span> },
      { key: "net_cents", label: "Net", render: (p) => <span>{cents(p.net_cents)}</span> },
    ];
    <ParityTable
      storageKey="payroll-aggregate"
      tableTestId="payroll-aggregate-table"
      emptyText="No payroll records for this period."
    />
  `;
  const bad = `
    export function PayrollAggregateTable() {
      return (
        <div>
          <table><thead><tr><th>Person</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; Person/Type/Class/Gross/Deductions/Net preserved.`);
}

main();
