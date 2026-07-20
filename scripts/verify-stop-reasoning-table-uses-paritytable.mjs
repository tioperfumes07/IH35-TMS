#!/usr/bin/env node
/**
 * verify-stop-reasoning-table-uses-paritytable — qbo-parity-a1 (StopReasoningTable surface)
 *
 * Fuel planner recommended-stop reasoning grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Columns #/Station/State/Mile/$/gal/
 * Gallons/Why This Stop/HOS preserved 1:1; skipped-stop strike styling retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-stop-reasoning-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/fuel/components/StopReasoningTable.tsx";

const REQUIRED_LABELS = ["#", "Station", "State/Mile", "$/gal", "Gallons", "Why This Stop", "HOS"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityTable"') && !src.includes("from '../../../components/parity/ParityTable'")) {
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
  if (!src.includes('storageKey="fuel-stop-reasoning"')) {
    errors.push(`${PAGE}: must set storageKey="fuel-stop-reasoning"`);
  }
  if (!src.includes("fuel-stop-reasoning-table")) {
    errors.push(`${PAGE}: must set data-testid="fuel-stop-reasoning-table"`);
  }
  if (!src.includes('emptyText="No recommended stops yet."')) {
    errors.push(`${PAGE}: must keep emptyText for empty recommendations`);
  }
  if (!src.includes("line-through") || !src.includes("bg-red-50")) {
    errors.push(`${PAGE}: must preserve skipped-stop strike + red row styling`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "__seq", label: "#" },
      { key: "station_name", label: "Station" },
      { key: "state_mile", label: "State/Mile" },
      { key: "price_per_gallon", label: "$/gal" },
      { key: "gallons", label: "Gallons" },
      { key: "why_this_stop", label: "Why This Stop" },
      { key: "hos", label: "HOS" },
    ];
    <div data-testid="fuel-stop-reasoning-table">
      <ParityTable
        storageKey="fuel-stop-reasoning"
        emptyText="No recommended stops yet."
        rowClassName={(row) => (row.is_skipped ? "bg-red-50" : "")}
      />
      <span className="text-red-700 line-through" />
    </div>
  `;
  const bad = `
    export function StopReasoningTable() {
      return (
        <div data-testid="fuel-stop-reasoning-table">
          <table><thead><tr><th>#</th></tr></thead></table>
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
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
