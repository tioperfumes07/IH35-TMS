#!/usr/bin/env node
/**
 * verify-ops-history-uses-paritytable — qbo-parity-a1 (OperationsHistoryTable surface)
 *
 * Driver operations-depth history (12 sub-views) must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Outages must surface ListErrorState
 * (never false-empty "No records found" on failure). EntityLink drill-through via
 * OperationsColumn.entityKind must remain available. The shared table receives one server page,
 * so its local pager must stay hidden in favor of the server Previous/Next controls.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ops-history-uses-paritytable";
const PAGE = "apps/frontend/src/components/drivers/OperationsHistoryTable.tsx";

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
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
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must keep EntityLink drill-through for entityKind columns`);
  }
  if (!src.includes('emptyText="No records found for this driver."')) {
    errors.push(`${PAGE}: must keep emptyText for empty operations history`);
  }
  if (!src.includes("Couldn't load operations history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for operations outage`);
  }
  if (!src.includes("storageKey={`driver-operations-${subView}`}")) {
    errors.push(`${PAGE}: must set storageKey per subView (driver-operations-\${subView})`);
  }
  if (!src.includes("Previous") || !src.includes("Next")) {
    errors.push(`${PAGE}: must keep server-side Previous/Next pagination`);
  }
  const tableStart = src.indexOf("<ParityTable");
  const tableBlock = tableStart >= 0 ? src.slice(tableStart, tableStart + 900) : "";
  if (!/pageSize=\{25\}/.test(tableBlock)) {
    errors.push(`${PAGE}: ParityTable must use the server page size of 25`);
  }
  if (!/\bhidePager\b/.test(tableBlock)) {
    errors.push(`${PAGE}: ParityTable must hide its local pager because Previous/Next are server-driven`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    import { EntityLink } from "../shared/EntityLink";
    <ListErrorState title="Couldn't load operations history" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey={\`driver-operations-\${subView}\`}
      emptyText="No records found for this driver."
      pageSize={25}
      hidePager
    />
    <button>Previous</button>
    <button>Next</button>
  `;
  const bad = `
    export function OperationsHistoryTable() {
      return (
        <div>
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
  const doublePager = good.replace("pageSize={25}\n      hidePager", "initialPageSize={25}");
  if (assertMigrated(doublePager).length < 2) {
    console.error(`${LABEL} --selftest FAIL planted double-pager regression escaped detection`);
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; EntityLink + pagination preserved.`);
}

main();
