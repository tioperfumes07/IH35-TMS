#!/usr/bin/env node
/**
 * verify-vehicle-plates-uses-paritytable — qbo-parity-a1 (vehicle-profile PlatesTable)
 *
 * Vehicle profile plates grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Country/Jurisdiction/Plate #/Expiration/Status
 * preserved 1:1; Archive row action + vp-plates-table testid retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vehicle-plates-uses-paritytable";
const PAGE = "apps/frontend/src/components/vehicle-profile/PlatesTable.tsx";

const REQUIRED_LABELS = ["Country", "Jurisdiction", "Plate #", "Expiration", "Status"];

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
  if (!src.includes('storageKey="vehicle-profile-plates"')) {
    errors.push(`${PAGE}: must set storageKey="vehicle-profile-plates"`);
  }
  if (!src.includes("vp-plates-table")) {
    errors.push(`${PAGE}: must preserve data-testid="vp-plates-table"`);
  }
  if (!src.includes("No plates on file.")) {
    errors.push(`${PAGE}: must keep emptyText for empty plates`);
  }
  if (!src.includes("Archive")) {
    errors.push(`${PAGE}: must keep Archive row action`);
  }
  if (!src.includes("rowActions")) {
    errors.push(`${PAGE}: must wire Archive via ParityTable rowActions`);
  }
  if (!src.includes("+ Create Plate")) {
    errors.push(`${PAGE}: must keep + Create Plate control`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [
      { key: "country", label: "Country" },
      { key: "jurisdiction", label: "Jurisdiction" },
      { key: "plate_number", label: "Plate #" },
      { key: "expiration", label: "Expiration" },
      { key: "status", label: "Status" },
    ];
    <div data-testid="vp-plates-table">
      <button>+ Create Plate</button>
      <ParityTable
        storageKey="vehicle-profile-plates"
        emptyText="No plates on file."
        rowActions={() => <button>Archive</button>}
      />
    </div>
  `;
  const bad = `
    export function PlatesTable() {
      return (
        <div data-testid="vp-plates-table">
          <table><thead><tr><th>Country</th></tr></thead></table>
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
