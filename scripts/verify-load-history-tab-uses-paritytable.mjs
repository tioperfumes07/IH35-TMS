#!/usr/bin/env node
/**
 * verify-load-history-tab-uses-paritytable — qbo-parity-a1 (LoadHistoryTab surface)
 *
 * Driver Load History must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Load # / Assigned At / Method / Previous Driver /
 * New Driver / Reason preserved 1:1; EntityLink + ListErrorState retained;
 * driver-load-history-* testids preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-history-tab-uses-paritytable";
const PAGE = "apps/frontend/src/components/drivers/LoadHistoryTab.tsx";

const REQUIRED_LABELS = ["Load #", "Assigned At", "Method", "Previous Driver", "New Driver", "Reason"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>, found ${parityUses}`);
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
  if (!src.includes('storageKey="driver-load-history"')) {
    errors.push(`${PAGE}: must set storageKey="driver-load-history"`);
  }
  if (!src.includes("driver-load-history-table")) {
    errors.push(`${PAGE}: must preserve data-testid="driver-load-history-table"`);
  }
  if (!src.includes("driver-load-history-tab")) {
    errors.push(`${PAGE}: must preserve data-testid="driver-load-history-tab"`);
  }
  if (!src.includes("No load assignment history for this driver.")) {
    errors.push(`${PAGE}: must keep emptyText for empty history`);
  }
  if (!src.includes("EntityLink") || !src.includes('kind="load"') || !src.includes('kind="driver"')) {
    errors.push(`${PAGE}: must keep EntityLink kind=load + kind=driver`);
  }
  if (!src.includes("previous_driver_id") || !src.includes("new_driver_id")) {
    errors.push(`${PAGE}: must wire previous_driver_id + new_driver_id`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState on query failure`);
  }
  if (!src.includes("filterBar")) {
    errors.push(`${PAGE}: must keep From/To filterBar`);
  }
  if (!/listDriverAssignedLoads\(driverId, operatingCompanyId, \{[\s\S]{0,180}limit: assignedPageSize,[\s\S]{0,120}offset: \(assignedPage - 1\) \* assignedPageSize/.test(src)) {
    errors.push(`${PAGE}: assigned-load reverse must request the selected server page`);
  }
  if (!/assignedTotal = assignedQ\.isError \? 0 : assignedQ\.data\?\.total_count \?\? 0/.test(src)) {
    errors.push(`${PAGE}: assigned-load reverse must consume the exact server total`);
  }
  if (!/data-testid="driver-assigned-loads-server-pager"/.test(src) || !/pageSize=\{assignedPageSize\}[\s\S]{0,120}\bhidePager\b/.test(src)) {
    errors.push(`${PAGE}: assigned-load reverse must use one server-total pager and hide ParityTable's local pager`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    import { EntityLink } from "../shared/EntityLink";
    const COLUMNS = [
      { key: "load_number", label: "Load #" },
      { key: "assigned_at", label: "Assigned At" },
      { key: "assignment_method", label: "Method" },
      { key: "previous_driver_name", label: "Previous Driver" },
      { key: "new_driver_name", label: "New Driver" },
      { key: "reason_code", label: "Reason" },
    ];
    function Tab() {
      const assignedTotal = assignedQ.isError ? 0 : assignedQ.data?.total_count ?? 0;
      listDriverAssignedLoads(driverId, operatingCompanyId, { limit: assignedPageSize, offset: (assignedPage - 1) * assignedPageSize });
      return (
        <div data-testid="driver-load-history-tab">
          <ListErrorState title="x" status={0} onRetry={() => {}} />
          <ParityTable
            storageKey="driver-load-history"
            emptyText="No load assignment history for this driver."
            tableTestId="driver-load-history-table"
            filterBar={<div>filters</div>}
            columns={COLUMNS}
          />
          <ParityTable pageSize={assignedPageSize} hidePager />
          <div data-testid="driver-assigned-loads-server-pager">Previous Next</div>
          <EntityLink kind="load" id={row.load_id} />
          <EntityLink kind="driver" id={row.previous_driver_id} />
          <EntityLink kind="driver" id={row.new_driver_id} />
        </div>
      );
    }
  `;
  const bad = `
    export function LoadHistoryTab() {
      return (
        <div data-testid="driver-load-history-tab">
          <table data-testid="driver-load-history-table"><thead><tr><th>Load #</th></tr></thead></table>
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
  const capped = good.replace("offset: (assignedPage - 1) * assignedPageSize", "offset: 0")
    .replace('data-testid="driver-assigned-loads-server-pager"', 'data-testid="removed-pager"')
    .replace("pageSize={assignedPageSize} hidePager", "initialPageSize={50}");
  if (assertMigrated(capped).length < 2) {
    console.error(`${LABEL} --selftest FAIL planted 50-row truncation escaped detection`);
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
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
