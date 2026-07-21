#!/usr/bin/env node
/**
 * verify-period-comparison-page-uses-paritytable — qbo-parity-a1 (PeriodComparisonPage surface)
 *
 * Accounting period-comparison report (display-only, money-adjacent) must use the shared
 * ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Outages must surface
 * ListErrorState (never a bare in-table error row). Columns Account / Period 1 / Period 2 /
 * Variance / Variance % / Lineage preserved, with the money() cents formatter and the
 * negative-variance red styling intact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-period-comparison-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/PeriodComparisonPage.tsx";

const REQUIRED_LABELS = ["Account", "Variance", "Variance %", "Lineage"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
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
  if (!src.includes("period1Label") || !src.includes("period2Label")) {
    errors.push(`${PAGE}: must keep dynamic period column labels (period1Label/period2Label)`);
  }
  if (!src.includes('?? "Period 1"') || !src.includes('?? "Period 2"')) {
    errors.push(`${PAGE}: must keep "Period 1"/"Period 2" fallback header labels`);
  }
  if (!src.includes("function money(") || !src.includes('currency: "USD"')) {
    errors.push(`${PAGE}: must keep the money() USD cents formatter`);
  }
  if (!src.includes("text-red-700")) {
    errors.push(`${PAGE}: must keep negative-variance red styling`);
  }
  if (!src.includes("Open lineage") || !src.includes("/accounting/posting-lineage")) {
    errors.push(`${PAGE}: must keep the Open lineage drill-through link`);
  }
  if (!src.includes('storageKey="period-comparison"')) {
    errors.push(`${PAGE}: must set storageKey="period-comparison"`);
  }
  if (!src.includes("YYYY-QN") || !src.includes("YYYY-MM")) {
    errors.push(`${PAGE}: must keep the YYYY-QN / YYYY-MM periods-format hint on error`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    function money(cents) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
    }
    const period1Label = data?.periods[0] ?? "Period 1";
    const period2Label = data?.periods[1] ?? "Period 2";
    const columns = [
      { key: "account", label: "Account" },
      { key: "period_1_amount", label: period1Label },
      { key: "period_2_amount", label: period2Label },
      { key: "variance_cents", label: "Variance", render: (row) => <span className="text-red-700">{money(row.variance_cents)}</span> },
      { key: "variance_pct", label: "Variance %" },
      { key: "lineage", label: "Lineage", render: (row) => <Link to="/accounting/posting-lineage">Open lineage</Link> },
    ];
    <ListErrorState title="Failed to load report" status={0} message="Use YYYY-QN or YYYY-MM in the periods input." onRetry={() => {}} />
    <ParityTable storageKey="period-comparison" />
  `;
  const bad = `
    export function PeriodComparisonPage() {
      return (
        <div>
          <table><thead><tr><th>Account</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
