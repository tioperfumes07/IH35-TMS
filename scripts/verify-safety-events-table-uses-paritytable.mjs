#!/usr/bin/env node
/**
 * verify-safety-events-table-uses-paritytable — qbo-parity-a1 (SafetyEventsTable surface)
 *
 * Safety events bulk-select grid must use shared ParityTable grammar (sort/resize/gear +
 * selectable batchActions), not a hand-rolled <table>. Columns Date/Driver/Unit/Type/Severity/
 * Source/Action/Status preserved 1:1; bulk export + archive stub retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-events-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx";

const REQUIRED_LABELS = ["Date", "Driver", "Unit", "Type", "Severity", "Source", "Action", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityTable"') && !src.includes("from '../../../components/parity/ParityTable'")) {
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
  if (!src.includes('storageKey="safety-events"')) {
    errors.push(`${PAGE}: must set storageKey="safety-events"`);
  }
  if (!src.includes('emptyText="No safety events found."')) {
    errors.push(`${PAGE}: must keep emptyText for settled-empty list`);
  }
  if (!src.includes("selectable")) {
    errors.push(`${PAGE}: must keep bulk-select via ParityTable selectable`);
  }
  if (!src.includes("batchActions")) {
    errors.push(`${PAGE}: must wire batchActions (export selected + archive stub)`);
  }
  if (!src.includes("Export Selected")) {
    errors.push(`${PAGE}: must preserve Export Selected bulk action label`);
  }
  if (!src.includes("Archive (coming soon)")) {
    errors.push(`${PAGE}: must preserve Archive (coming soon) bulk action stub`);
  }
  if (!src.includes("maxSelectable={200}")) {
    errors.push(`${PAGE}: must preserve maxSelectable={200} bulk cap`);
  }
  if (!src.includes("Open accident")) {
    errors.push(`${PAGE}: must preserve per-row Open accident / View action`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "event_at", label: "Date" },
      { key: "driver_full_name", label: "Driver" },
      { key: "unit_display_id", label: "Unit" },
      { key: "event_type", label: "Type" },
      { key: "severity", label: "Severity" },
      { key: "source", label: "Source" },
      { key: "action", label: "Action" },
      { key: "status", label: "Status" },
    ];
    <ParityTable
      storageKey="safety-events"
      emptyText="No safety events found."
      selectable
      maxSelectable={200}
      batchActions={() => <>Export Selected Archive (coming soon) Open accident</>}
    />
  `;
  const bad = `
    export function SafetyEventsTable() {
      return (
        <table><thead><tr><th>Date</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + bulk actions preserved.`);
}

main();
