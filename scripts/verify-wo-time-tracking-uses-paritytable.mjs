#!/usr/bin/env node
/**
 * verify-wo-time-tracking-uses-paritytable — qbo-parity-a1 (WOTimeTrackingPanel surface)
 *
 * WO detail labor-time entries grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Load failures must surface ListErrorState (never a false-empty list).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wo-time-tracking-uses-paritytable";
const PAGE = "apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx";

const REQUIRED_LABELS = ["ID", "Actor", "Start", "End", "Min", "Cost ¢"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
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
  if (!src.includes('storageKey="wo-time-tracking-entries"')) {
    errors.push(`${PAGE}: must set storageKey="wo-time-tracking-entries"`);
  }
  if (!src.includes('tableTestId="wo-time-tracking-entries-parity"')) {
    errors.push(`${PAGE}: must set tableTestId="wo-time-tracking-entries-parity"`);
  }
  if (!src.includes('data-testid="wo-time-tracking-entries-table"')) {
    errors.push(`${PAGE}: must keep wo-time-tracking-entries-table wrapper`);
  }
  if (!src.includes("No time entries yet.")) {
    errors.push(`${PAGE}: must keep emptyText`);
  }
  if (!src.includes("Start timer")) {
    errors.push(`${PAGE}: must keep Start timer action`);
  }
  if (!src.includes("Couldn't load time entries")) {
    errors.push(`${PAGE}: must keep ListErrorState title for entries outage`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "id", label: "ID" },
      { key: "actor_kind", label: "Actor" },
      { key: "started_at", label: "Start" },
      { key: "ended_at", label: "End" },
      { key: "duration_minutes", label: "Min" },
      { key: "computed_labor_cost_cents", label: "Cost ¢" },
    ];
    <div data-testid="wo-time-tracking-entries-table">
      <Button>Start timer</Button>
      <ListErrorState title="Couldn't load time entries" status={0} onRetry={() => {}} />
      <ParityTable
        storageKey="wo-time-tracking-entries"
        tableTestId="wo-time-tracking-entries-parity"
        emptyText="No time entries yet."
      />
    </div>
  `;
  const bad = `
    export function WOTimeTrackingPanel() {
      return (
        <div>
          <table><thead><tr><th>ID</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + wo-time-tracking testids preserved.`);
}

main();
