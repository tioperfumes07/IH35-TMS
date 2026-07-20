#!/usr/bin/env node
/**
 * verify-driver-hub-reporting-uses-paritytable — qbo-parity-a1 (DriverHubReportingPage)
 *
 * Driver Inbox Reporting by-driver grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query outages must surface
 * ListErrorState (never a bare red banner / false-empty).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-hub-reporting-uses-paritytable";
const PAGE = "apps/frontend/src/pages/home/DriverHubReportingPage.tsx";

const REQUIRED_LABELS = [
  "Driver",
  "Total",
  "Approved",
  "Denied",
  "Approval %",
  "Time-to-view",
  "Time-to-approve",
  "Approved volume",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
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
  if (!src.includes('storageKey="driver-hub-reporting-by-driver"')) {
    errors.push(`${PAGE}: must set storageKey="driver-hub-reporting-by-driver"`);
  }
  if (!src.includes('tableTestId="driver-hub-reporting-table"')) {
    errors.push(`${PAGE}: must keep tableTestId="driver-hub-reporting-table"`);
  }
  if (!src.includes("No requests in this period.")) {
    errors.push(`${PAGE}: must keep emptyText for empty by-driver period`);
  }
  if (!src.includes("Could not load reporting.")) {
    errors.push(`${PAGE}: must keep ListErrorState title for reporting outage`);
  }
  if (!src.includes("Export CSV")) {
    errors.push(`${PAGE}: must keep Export CSV action`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    <ListErrorState title="Could not load reporting." status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="driver-hub-reporting-by-driver"
      tableTestId="driver-hub-reporting-table"
      emptyText="No requests in this period."
      columns={[
        { key: "driver_name", label: "Driver" },
        { key: "total_requests", label: "Total" },
        { key: "approved", label: "Approved" },
        { key: "denied", label: "Denied" },
        { key: "approval_rate_pct", label: "Approval %" },
        { key: "avg_time_to_view_seconds", label: "Time-to-view" },
        { key: "avg_time_to_approve_seconds", label: "Time-to-approve" },
        { key: "approved_advance_cents", label: "Approved volume" },
      ]}
    />
    <button>Export CSV</button>
  `;
  const bad = `
    export function DriverHubReportingPage() {
      return (
        <div>
          <table><thead><tr><th>Driver</th></tr></thead></table>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + driver-hub-reporting-table testid preserved.`,
  );
}

main();
