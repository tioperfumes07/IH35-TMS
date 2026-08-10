#!/usr/bin/env node
/**
 * verify-sales-tax-page-uses-paritytable — accounting SalesTaxPage returns list surface
 *
 * The sales-tax returns list must use the shared ParityTable grammar (sort/resize/gear/pager),
 * not a hand-rolled <table>. DISPLAY-ONLY migration on a financial surface (owner greenlit
 * UI-only): amounts stay cents→money() formatted, column order Agency/Period/Taxable/Collected/
 * Owed/Status/Actions is preserved 1:1, and the inline "Mark filed" / "Mark paid" action buttons
 * keep their exact handlers (fileSalesTaxReturn / markSalesTaxReturnPaid). The honest error
 * surfaces must survive: returnsQuery.isError → ListErrorState with retry, and the
 * agenciesQuery.isError → ListErrorBanner (locked by verify-accounting-query-error-states).
 *
 * Rule 17: auto-discovered via
 * scripts/verify-steps/1142-verify-sales-tax-page-uses-paritytable.mjs
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * Usage:
 *   node scripts/verify-sales-tax-page-uses-paritytable.mjs
 *   node scripts/verify-sales-tax-page-uses-paritytable.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sales-tax-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/SalesTaxPage.tsx";

const REQUIRED_LABELS = ["Agency", "Period", "Taxable", "Collected", "Owed", "Status", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
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
  if (!src.includes('storageKey="accounting-sales-tax-returns"')) {
    errors.push(`${PAGE}: must set storageKey="accounting-sales-tax-returns"`);
  }
  if (!src.includes('tableTestId="sales-tax-returns-table"')) {
    errors.push(`${PAGE}: must set tableTestId="sales-tax-returns-table"`);
  }
  // Display-only invariants: amounts stay money(cents), inline actions keep exact handlers.
  if (!src.includes("money(row.taxable_sales_cents)") || !src.includes("money(row.tax_collected_cents)") || !src.includes("money(row.tax_owed_cents)")) {
    errors.push(`${PAGE}: money columns must keep money(cents) formatting 1:1`);
  }
  if (!src.includes("fileSalesTaxReturn(row.id, companyId)")) {
    errors.push(`${PAGE}: must keep the "Mark filed" fileSalesTaxReturn handler unchanged`);
  }
  if (!src.includes("markSalesTaxReturnPaid(row.id, { operating_company_id: companyId })")) {
    errors.push(`${PAGE}: must keep the "Mark paid" markSalesTaxReturnPaid handler unchanged`);
  }
  if (!src.includes("No sales tax returns prepared yet.")) {
    errors.push(`${PAGE}: must keep the empty text "No sales tax returns prepared yet."`);
  }
  if (!src.includes("Couldn't load sales tax returns") || !src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep the returnsQuery.isError → ListErrorState honest error surface`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep the agenciesQuery ListErrorBanner error surface`);
  }
  if (!/<SelectCombobox[\s\S]*?value=\{selectedAgencyId\}/.test(src)) {
    errors.push(`${PAGE}: agency must use the searchable select adapter`);
  }
  if (/<select[\s\S]*?value=\{selectedAgencyId\}/.test(src)) {
    errors.push(`${PAGE}: agency must not regress to a native ID-valued select`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    const SelectCombobox = () => <input />;
    const COLUMNS = [
      { key: "agency_name", label: "Agency" },
      { key: "period_start", label: "Period" },
      { key: "taxable_sales_cents", label: "Taxable", render: (row) => money(row.taxable_sales_cents) },
      { key: "tax_collected_cents", label: "Collected", render: (row) => money(row.tax_collected_cents) },
      { key: "tax_owed_cents", label: "Owed", render: (row) => money(row.tax_owed_cents) },
      { key: "status", label: "Status" },
      { key: "actions", label: "Actions", render: (row) => (
        <Button onClick={() => { void fileSalesTaxReturn(row.id, companyId); }}>Mark filed</Button>,
        <Button onClick={() => { void markSalesTaxReturnPaid(row.id, { operating_company_id: companyId }); }}>Mark paid</Button>
      ) },
    ];
    {returnsQuery.isError ? (
      <ListErrorState title="Couldn't load sales tax returns" onRetry={() => void returnsQuery.refetch()} />
    ) : (
      <ParityTable
        storageKey="accounting-sales-tax-returns"
        tableTestId="sales-tax-returns-table"
        emptyText="No sales tax returns prepared yet."
      />
    )}
    <SelectCombobox value={selectedAgencyId} />
  `;
  const bad = `
    export function SalesTaxPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Agency</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/amount formatting/inline actions/error surfaces preserved.`);
}

main();
