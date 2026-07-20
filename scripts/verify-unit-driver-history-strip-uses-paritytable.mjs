#!/usr/bin/env node
/**
 * verify-unit-driver-history-strip-uses-paritytable — qbo-parity-a1 (UnitDriverHistoryStrip)
 *
 * Unit/driver assignment history strip must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Query failures must surface ListErrorState (never false-empty on
 * failure). Columns Unit / Driver / Started / Ended / Source preserved 1:1; dynamic title +
 * Last N days chrome preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-driver-history-strip-uses-paritytable";
const PAGE = "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx";

const REQUIRED_LABELS = ["Unit", "Driver", "Started", "Ended", "Source"];

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
  if (!src.includes('storageKey="unit-driver-history"')) {
    errors.push(`${PAGE}: must set storageKey="unit-driver-history"`);
  }
  if (!src.includes("unit-driver-history-strip")) {
    errors.push(`${PAGE}: must preserve data-testid="unit-driver-history-strip"`);
  }
  if (!src.includes("unit-driver-history-table")) {
    errors.push(`${PAGE}: must set tableTestId="unit-driver-history-table"`);
  }
  if (!src.includes("No assignment windows found for this period.")) {
    errors.push(`${PAGE}: must keep emptyText for empty history`);
  }
  if (!src.includes("Couldn't load driver assignment history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for history outage`);
  }
  if (!src.includes("Unit driver history") || !src.includes("Driver assignment history")) {
    errors.push(`${PAGE}: must keep dynamic section titles`);
  }
  if (!src.includes("Last {days} days")) {
    errors.push(`${PAGE}: must keep Last N days subtitle`);
  }
  if (!src.includes("Unassigned")) {
    errors.push(`${PAGE}: must keep Unassigned fallback for missing driver_name`);
  }
  if (!src.includes('return "Current"')) {
    errors.push(`${PAGE}: must keep Current label for open-ended assignment windows`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "unit_number", label: "Unit" },
      { key: "driver_name", label: "Driver" },
      { key: "started_at", label: "Started" },
      { key: "ended_at", label: "Ended" },
      { key: "source", label: "Source" },
    ];
    function formatDateTime(value) {
      if (!value) return "Current";
    }
    export function UnitDriverHistoryStrip({ days = 30 }) {
      const title = unitId ? "Unit driver history" : "Driver assignment history";
      return (
        <section data-testid="unit-driver-history-strip">
          <h3>{title}</h3>
          <span>Last {days} days</span>
          <ListErrorState title="Couldn't load driver assignment history" status={0} onRetry={() => {}} />
          <ParityTable
            storageKey="unit-driver-history"
            emptyText="No assignment windows found for this period."
            tableTestId="unit-driver-history-table"
            columns={COLUMNS}
          />
          {row.driver_name ?? "Unassigned"}
        </section>
      );
    }
  `;
  const bad = `
    export function UnitDriverHistoryStrip() {
      return (
        <section>
          <table><thead><tr><th>Unit</th></tr></thead></table>
        </section>
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
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
