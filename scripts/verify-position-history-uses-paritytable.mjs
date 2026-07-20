#!/usr/bin/env node
/**
 * verify-position-history-uses-paritytable — qbo-parity-a1 (PositionHistoryPage surface)
 *
 * Safety Integrity position history timeline must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Outages must surface ListErrorState
 * (never false-empty "No position history records found" on failure). Unit/action
 * filters + server Previous/Next pagination preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-position-history-uses-paritytable";
const PAGE = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";

const REQUIRED_LABELS = ["Timestamp", "Action", "Unit", "Position", "Part", "Actor", "Notes"];

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
  if (!src.includes('storageKey="safety-position-history"')) {
    errors.push(`${PAGE}: must set storageKey="safety-position-history"`);
  }
  if (!src.includes('emptyText="No position history records found"')) {
    errors.push(`${PAGE}: must keep emptyText for empty position history`);
  }
  if (!src.includes("Couldn't load position history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for position history outage`);
  }
  if (!src.includes("Previous") || !src.includes("Next")) {
    errors.push(`${PAGE}: must keep server-side Previous/Next pagination`);
  }
  if (!src.includes('data-testid="mobile-optimized-table"')) {
    errors.push(`${PAGE}: must keep mobile-optimized-table testid wrapper`);
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must use EntityLink for unit drill-through`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { EntityLink } from "../../components/shared/EntityLink";
    const columns = [
      { key: "action_at", label: "Timestamp" },
      { key: "action", label: "Action" },
      { key: "unit_id", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} /> },
      { key: "position_code", label: "Position" },
      { key: "part_number", label: "Part" },
      { key: "actor_id", label: "Actor" },
      { key: "notes", label: "Notes" },
    ];
    <div data-testid="mobile-optimized-table">
      <ListErrorState title="Couldn't load position history" status={0} onRetry={() => {}} />
      <ParityTable
        storageKey="safety-position-history"
        emptyText="No position history records found"
      />
      <button>Previous</button>
      <button>Next</button>
    </div>
  `;
  const bad = `
    export function PositionHistoryPage() {
      return (
        <div>
          <table><thead><tr><th>Timestamp</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + pagination preserved.`);
}

main();
