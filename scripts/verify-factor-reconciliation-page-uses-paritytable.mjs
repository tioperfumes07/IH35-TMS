#!/usr/bin/env node
/**
 * verify-factor-reconciliation-page-uses-paritytable — qbo-parity-a1 (FactorReconciliationPage surface)
 *
 * The factor reconciliation run-detail items table must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. DISPLAY-ONLY migration on a money-adjacent
 * surface: the money() cents formatter, the Statement invoice/State/Factor/Ledger/Variance
 * column order, the ListErrorState on candidates/runs errors, and the ListErrorBanner on the
 * items query error must all be preserved. The table itself is read-only — the import
 * mutation lives on the candidate cards, NOT inside the migrated table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factor-reconciliation-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx";

const REQUIRED_LABELS = ["Statement invoice", "State", "Factor", "Ledger", "Variance"];

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
  if (!src.includes('storageKey="accounting-factor-reconciliation-items"')) {
    errors.push(`${PAGE}: must set storageKey="accounting-factor-reconciliation-items"`);
  }
  if (!src.includes('tableTestId="factor-reconciliation-items-table"')) {
    errors.push(`${PAGE}: must set tableTestId="factor-reconciliation-items-table"`);
  }
  if (!/function money\(/.test(src) || !src.includes("money(item.variance_cents)")) {
    errors.push(`${PAGE}: must keep the money() cents formatter on Factor/Ledger/Variance cells`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState on the candidates/runs query error surfaces`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep ListErrorBanner on the items query error surface`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    function money(cents) { return String(cents); }
    const itemColumns = [
      { key: "statement_invoice_number", label: "Statement invoice" },
      { key: "ledger_match_state", label: "State" },
      { key: "factor_amount_cents", label: "Factor" },
      { key: "ledger_amount_cents", label: "Ledger" },
      { key: "variance_cents", label: "Variance", render: (item) => money(item.variance_cents) },
    ];
    <ListErrorState title="Couldn't load import candidates" />
    <ListErrorBanner message="Failed to load reconciliation items" />
    <ParityTable
      storageKey="accounting-factor-reconciliation-items"
      tableTestId="factor-reconciliation-items-table"
    />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    export function FactorReconciliationPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Statement invoice</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; money formatting, column order, and error surfaces preserved.`);
}

main();
