#!/usr/bin/env node
/**
 * verify-user-activity-tab-uses-paritytable — ParityTable wave (admin, non-money)
 *
 * Admin User detail "Activity" tab (audit trail for a single user) was a hand-rolled `<table>`
 * with a bare red outage line ("Failed to load user activity"). Migrated to shared `ParityTable`
 * (sort + resize + gear + renderExpanded Before→After diff) and replaced the ad-hoc error with
 * `ListErrorState` + Retry. Columns When / Action / Summary / Source preserved 1:1; date-range +
 * event-type + source filters, Voids & Reversals toggle, Refresh, and CSV export unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-activity-tab-uses-paritytable";
const FILE = "apps/frontend/src/components/users/UserActivityTab.tsx";

const REQUIRED_LABELS = ["When", "Action", "Summary", "Source"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../parity/ParityTable"') &&
    !src.includes("from '../parity/ParityTable'")
  ) {
    errors.push(`${FILE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${FILE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${FILE}: expected exactly one <ParityTable>`);
  }
  for (const tag of ["table", "thead", "tbody", "tr", "th", "td"]) {
    if (new RegExp(`<${tag}[\\s>]`).test(src)) {
      errors.push(`${FILE}: must not contain hand-rolled <${tag}> markup`);
    }
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${FILE}: missing preserved column label "${label}"`);
    }
  }
  if (!src.includes('data-testid="user-activity-tab"')) {
    errors.push(`${FILE}: must preserve the "user-activity-tab" outer testid`);
  }
  if (!src.includes('tableTestId="user-activity-table"')) {
    errors.push(`${FILE}: must set tableTestId="user-activity-table"`);
  }
  if (!src.includes('storageKey="user-activity-tab"')) {
    errors.push(`${FILE}: must set a stable ParityTable storageKey`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${FILE}: must keep renderExpanded for the Before→After payload diff`);
  }
  if (!src.includes("Voids & Reversals")) {
    errors.push(`${FILE}: must preserve the Voids & Reversals filter toggle`);
  }
  if (!src.includes("Export CSV")) {
    errors.push(`${FILE}: must preserve CSV export`);
  }
  if (!src.includes("No audit activity found for this user.")) {
    errors.push(`${FILE}: must preserve the empty-state copy`);
  }
  if (!src.includes("Couldn't load user activity")) {
    errors.push(`${FILE}: must keep the ListErrorState title for outage`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const columns = [
      { key: "created_at", label: "When" },
      { key: "event_type", label: "Action" },
      { key: "summary", label: "Summary" },
      { key: "source", label: "Source" },
    ];
    <div data-testid="user-activity-tab">
      <button>Voids & Reversals</button>
      <button>Export CSV</button>
      <ListErrorState title="Couldn't load user activity" status={0} onRetry={() => {}} />
      <ParityTable
        storageKey="user-activity-tab"
        emptyText="No audit activity found for this user."
        tableTestId="user-activity-table"
        renderExpanded={(row) => <pre>{row.payload}</pre>}
      />
    </div>
  `;
  const bad = `
    export function UserActivityTab() {
      return (
        <div>
          <p className="text-sm text-red-600">Failed to load user activity</p>
          <table><thead><tr><th>When</th></tr></thead></table>
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
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${FILE} uses ParityTable + ListErrorState; columns + testids preserved.`);
}

main();
