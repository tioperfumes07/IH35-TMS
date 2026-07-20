#!/usr/bin/env node
/**
 * verify-driver-day-summary-uses-paritytable — qbo-parity-a1 (DriverDaySummaryCard surface)
 *
 * Home "Driver day-summaries" grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Query failures must surface ListErrorState (never a bare red
 * line). Columns Driver / Miles / On-duty hrs / Fuel stops / On-time / Late preserved;
 * DatePicker + no-HOS empty copy preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-day-summary-uses-paritytable";
const PAGE = "apps/frontend/src/components/home/DriverDaySummaryCard.tsx";

const REQUIRED_LABELS = ["Driver", "Miles", "On-duty hrs", "Fuel stops", "On-time", "Late"];

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
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="home-driver-day-summary"')) {
    errors.push(`${PAGE}: must set storageKey="home-driver-day-summary"`);
  }
  if (!src.includes('tableTestId="home-driver-day-summary-table"')) {
    errors.push(`${PAGE}: must set tableTestId="home-driver-day-summary-table"`);
  }
  if (!src.includes("Couldn't load summary right now.")) {
    errors.push(`${PAGE}: must keep ListErrorState title for summary outage`);
  }
  if (!src.includes("No HOS data recorded for drivers on")) {
    errors.push(`${PAGE}: must keep no-HOS empty copy`);
  }
  if (!src.includes("DatePicker")) {
    errors.push(`${PAGE}: must keep DatePicker date control`);
  }
  if (!src.includes("Driver day-summaries")) {
    errors.push(`${PAGE}: must keep section heading Driver day-summaries`);
  }
  if (!src.includes("text-emerald-700")) {
    errors.push(`${PAGE}: must keep on-time emerald styling`);
  }
  if (!src.includes("text-amber-700")) {
    errors.push(`${PAGE}: must keep late amber styling`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { DatePicker } from "../../components/forms/DatePicker";
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    <h3>Driver day-summaries</h3>
    <DatePicker value={date} onChange={() => {}} />
    <ListErrorState title="Couldn't load summary right now." status={0} onRetry={() => {}} />
    <div>No HOS data recorded for drivers on {date}</div>
    <ParityTable
      storageKey="home-driver-day-summary"
      tableTestId="home-driver-day-summary-table"
      columns={[
        { key: "driver_name", label: "Driver" },
        { key: "miles", label: "Miles" },
        { key: "hours_on_duty", label: "On-duty hrs" },
        { key: "fuel_stops", label: "Fuel stops" },
        { key: "on_time_arrivals", label: "On-time" },
        { key: "late_arrivals", label: "Late" },
      ]}
    />
    <span className="text-emerald-700" />
    <span className="text-amber-700" />
  `;
  const bad = `
    export function DriverDaySummaryCard() {
      return (
        <div>
          <table><thead><tr><th>Driver</th></tr></thead></table>
          <p className="text-red-700">Couldn't load summary right now.</p>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + DatePicker preserved.`);
}

main();
