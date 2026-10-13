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
 *
 * ACCT-F4431379 (Lead 443.137 9d) — old: TWO ParityTables (driver settlements + QBO W-2 runs), the
 * Run/Employees labels, the qbo-w2-runs storageKey/empty text and the sync Refresh mutation were
 * required; new: ONE ParityTable (driver settlements) is required and the QBO W-2 table + Refresh
 * must be ABSENT; why: driver pay comes ONLY from driver_finance and QBO is out of scope for USMCA.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payroll-aggregated-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/PayrollAggregatedPage.tsx";

const REQUIRED_LABELS = ["Period", "Status", "Net"];

const REQUIRED_STORAGE_KEYS = [
  "payroll-aggregated-driver-settlements",
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
    errors.push(`${PAGE}: expected a <ParityTable> (driver settlements)`);
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
  if (/qbo_w2_runs|qbo_payroll_run|payroll-aggregated-qbo-w2-runs/.test(src)) {
    errors.push(`${PAGE}: must not render a QBO Payroll W-2 runs table (driver pay comes ONLY from driver_finance)`);
  }
  if (!src.includes("money(Number(row.net_cents ?? 0))")) {
    errors.push(`${PAGE}: must keep money() cents formatting for Net columns`);
  }
  if (src.includes("refreshAggregatedPayroll")) {
    errors.push(`${PAGE}: must not offer the QBO payroll sync Refresh`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    const SETTLEMENT_COLUMNS = [
      { key: "pay_period_start", label: "Period" },
      { key: "status", label: "Status" },
      { key: "net_cents", label: "Net", render: (row) => money(Number(row.net_cents ?? 0)) },
    ];
    <ParityTable storageKey="payroll-aggregated-driver-settlements" emptyText="No driver settlements." rows={[]} columns={[]} rowKey={(r) => r.id} />
  `;
  // ACCT-F4431379 plant: a page that re-adds the QBO W-2 runs table and its Refresh must fail.
  const qboBack = good + `
    import { refreshAggregatedPayroll } from "../../api/payrollAggregated";
    <ParityTable storageKey="payroll-aggregated-qbo-w2-runs" rows={data?.qbo_w2_runs ?? []} columns={[]} rowKey={(r) => r.qbo_payroll_run_id} />
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
  const qboErrors = assertMigrated(qboBack);
  if (!qboErrors.some((e) => e.includes("QBO Payroll W-2 runs table")) || !qboErrors.some((e) => e.includes("sync Refresh"))) {
    console.error(`${LABEL} --selftest FAIL qbo-back fixture should fail on the QBO table and Refresh:`, qboErrors);
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
    `OK ${LABEL}: ${PAGE} renders driver settlements via ParityTable; no QBO W-2 runs table or Refresh.`,
  );
}

main();
