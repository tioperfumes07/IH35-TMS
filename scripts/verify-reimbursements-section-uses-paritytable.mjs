#!/usr/bin/env node
/**
 * verify-reimbursements-section-uses-paritytable — qbo-parity-a1 (driver-finance
 * settlement detail "C. Reimbursements" section)
 *
 * The settlement-detail Reimbursements section grid must use shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. Financial surface —
 * owner-greenlit DISPLAY-ONLY migration of a READ-ONLY props-fed line list (no
 * posting/mutation logic; amounts arrive precomputed via props). Columns
 * Date / Description / Receipt # / Amount, the "C. Reimbursements" heading, the
 * receipt link button, the `$…toFixed(2)` amount formatting, and the Subtotal
 * footer line must be preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reimbursements-section-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx";

const REQUIRED_LABELS = ["Date", "Description", "Receipt #", "Amount"];

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
  if (!src.includes('storageKey="driver-finance-reimbursements-section"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-reimbursements-section"`);
  }
  if (!src.includes('tableTestId="driver-finance-reimbursements-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-finance-reimbursements-table"`);
  }
  if (!src.includes("C. Reimbursements")) {
    errors.push(`${PAGE}: must keep the "C. Reimbursements" heading`);
  }
  if (!src.includes("Subtotal:")) {
    errors.push(`${PAGE}: must keep the Subtotal footer line`);
  }
  if (!/\.toFixed\(2\)/.test(src)) {
    errors.push(`${PAGE}: must keep the $…toFixed(2) amount formatting`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "receipt", label: "Receipt #", render: (line) => <button>{line.receipt}</button> },
      { key: "amount", label: "Amount", render: (line) => \`$\${Number(line.amount).toFixed(2)}\` },
    ];
    <h3>C. Reimbursements</h3>
    <ParityTable
      storageKey="driver-finance-reimbursements-section"
      tableTestId="driver-finance-reimbursements-table"
    />
    <div>Subtotal: \${subtotal.toFixed(2)}</div>
  `;
  const bad = `
    export function ReimbursementsSection() {
      return (
        <section>
          <table><thead><tr><th>Date</th></tr></thead></table>
        </section>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns + heading + receipt link + subtotal preserved.`,
  );
}

main();
