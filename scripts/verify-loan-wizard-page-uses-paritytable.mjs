#!/usr/bin/env node
/**
 * verify-loan-wizard-page-uses-paritytable — qbo-parity-a1 (LoanWizardPage opening-JE preview)
 *
 * The Loan Wizard opening-journal-entry PREVIEW table must use the shared ParityTable grammar
 * (sort/resize/gear + pager), not a hand-rolled <table>. Display-only migration on a financial
 * surface: the dollars() cents formatter, the debit/credit side split, the trailing Totals row,
 * and the preview-only posture (previewLoanWizard call, no mutations — posting is a separate,
 * owner-gated step) must all be preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-loan-wizard-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/finance/LoanWizardPage.tsx";

const REQUIRED_LABELS = ["Description", "Debit", "Credit"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
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
  if (!src.includes('storageKey="loan-wizard-opening-je"')) {
    errors.push(`${PAGE}: must set storageKey="loan-wizard-opening-je"`);
  }
  if (!src.includes('tableTestId="loan-wizard-opening-je-table"')) {
    errors.push(`${PAGE}: must set tableTestId="loan-wizard-opening-je-table"`);
  }
  if (!src.includes('description: "Totals"')) {
    errors.push(`${PAGE}: must keep the trailing Totals row (debit_total_cents / credit_total_cents)`);
  }
  if (!src.includes("debit_total_cents") || !src.includes("credit_total_cents")) {
    errors.push(`${PAGE}: Totals row must render debit_total_cents and credit_total_cents via dollars()`);
  }
  if (!src.includes("dollars(")) {
    errors.push(`${PAGE}: must keep the dollars() cents→currency formatter`);
  }
  if (!src.includes("previewLoanWizard")) {
    errors.push(`${PAGE}: must keep the previewLoanWizard preview call (display-only migration)`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: preview-only surface — must not add mutations (posting is owner-gated elsewhere)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { previewLoanWizard } from "../../api/financeLoanWizard";
    const dollars = (cents) => String(cents);
    const COLUMNS = [
      { key: "description", label: "Description" },
      { key: "debit", label: "Debit" },
      { key: "credit", label: "Credit" },
    ];
    <ParityTable
      storageKey="loan-wizard-opening-je"
      tableTestId="loan-wizard-opening-je-table"
      rows={[
        { id: "totals", description: "Totals", debit: dollars(je.debit_total_cents), credit: dollars(je.credit_total_cents), isTotals: true },
      ]}
    />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function LoanWizardPage() {
      return (
        <table className="mt-1 w-full text-xs">
          <tbody><tr><td>Totals</td></tr></tbody>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; dollars()/Totals/preview-only posture preserved.`);
}

main();
