#!/usr/bin/env node
/**
 * verify-payroll-aggregated-page-uses-paritytable — qbo-parity-a1 (PayrollAggregatedPage surface)
 *
 * The accounting Payroll (aggregated) page (Option B — TMS driver settlements + QBO W-2 runs
 * mirrored read-only) must render BOTH of its tables via the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only migration: the tables have no
 * mutations (the only mutation on the page is the sync Refresh button, outside the tables, and
 * must be preserved unchanged). Columns Period/Status/Net and Run/Employees/Net preserved 1:1;
 * money() cents formatting, right-aligned numeric cells, the ListErrorBanner error surface, and
 * both empty-state messages preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payroll-aggregated-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/PayrollAggregatedPage.tsx";

const REQUIRED_LABELS = ["Period", "Status", "Net", "Run", "Employees"];

const REQUIRED_STORAGE_KEYS = [
  "payroll-aggregated-driver-settlements",
  "payroll-aggregated-qbo-w2-runs",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (driver settlements + QBO W-2 runs)`);
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
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(`storageKey="${key}"`)) {
      errors.push(`${PAGE}: must set storageKey="${key}"`);
    }
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep the ListErrorBanner error surface on query error`);
  }
  if (!src.includes("No driver settlements.")) {
    errors.push(`${PAGE}: must keep the driver-settlements empty text`);
  }
  if (!src.includes("No QBO payroll runs linked yet.")) {
    errors.push(`${PAGE}: must keep the QBO W-2 runs empty text`);
  }
  if (!src.includes("money(Number(row.net_cents ?? 0))")) {
    errors.push(`${PAGE}: must keep money() cents formatting for Net columns`);
  }
  if (!src.includes("refreshAggregatedPayroll")) {
    errors.push(`${PAGE}: must keep the sync Refresh mutation (unchanged, outside the tables)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    import { refreshAggregatedPayroll } from "../../api/payrollAggregated";
    const SETTLEMENT_COLUMNS = [
      { key: "pay_period_start", label: "Period" },
      { key: "status", label: "Status" },
      { key: "net_cents", label: "Net", render: (row) => money(Number(row.net_cents ?? 0)) },
    ];
    const W2_RUN_COLUMNS = [
      { key: "qbo_payroll_run_name", label: "Run" },
      { key: "employee_count", label: "Employees" },
      { key: "net_cents", label: "Net", render: (row) => money(Number(row.net_cents ?? 0)) },
    ];
    <ParityTable storageKey="payroll-aggregated-driver-settlements" emptyText="No driver settlements." rows={[]} columns={[]} rowKey={(r) => r.id} />
    <ParityTable storageKey="payroll-aggregated-qbo-w2-runs" emptyText="No QBO payroll runs linked yet." rows={[]} columns={[]} rowKey={(r) => r.id} />
  `;
  const bad = `
    export function PayrollAggregatedPage() {
      return (
        <div>
          <table className="min-w-full text-left text-xs">
            <thead><tr><th>Period</th></tr></thead>
          </table>
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
  console.log(
    `OK ${LABEL}: ${PAGE} renders both tables via ParityTable; columns, money formatting, empty texts, and Refresh preserved.`,
  );
}

main();
