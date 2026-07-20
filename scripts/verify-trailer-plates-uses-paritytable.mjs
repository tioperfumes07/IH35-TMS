#!/usr/bin/env node
/**
 * verify-trailer-plates-uses-paritytable — qbo-parity-a1 (trailer-profile PlatesTable)
 *
 * Trailer profile plates grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Country/Jurisdiction/Plate/Expiration preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-trailer-plates-uses-paritytable";
const PAGE = "apps/frontend/src/components/trailer-profile/PlatesTable.tsx";

const REQUIRED_LABELS = ["Country", "Jurisdiction", "Plate", "Expiration"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../parity/ParityTable"') &&
    !src.includes("from '../parity/ParityTable'")
  ) {
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
  if (!src.includes('storageKey="trailer-profile-plates"')) {
    errors.push(`${PAGE}: must set storageKey="trailer-profile-plates"`);
  }
  if (!src.includes('data-testid="tp-plates-table"')) {
    errors.push(`${PAGE}: must keep wrapper data-testid="tp-plates-table"`);
  }
  if (!src.includes("No plates on file.")) {
    errors.push(`${PAGE}: must keep emptyText "No plates on file."`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [
      { key: "country", label: "Country" },
      { key: "jurisdiction", label: "Jurisdiction" },
      { key: "plate_number", label: "Plate" },
      { key: "expiration", label: "Expiration" },
    ];
    <div data-testid="tp-plates-table">
      <ParityTable storageKey="trailer-profile-plates" emptyText="No plates on file." />
    </div>
  `;
  const bad = `
    export function PlatesTable() {
      return (
        <table data-testid="tp-plates-table">
          <thead><tr><th>Country</th></tr></thead>
        </table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns preserved.`);
}

main();
