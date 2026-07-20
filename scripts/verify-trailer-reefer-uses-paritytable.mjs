#!/usr/bin/env node
/**
 * verify-trailer-reefer-uses-paritytable — qbo-parity-a1 (TrailerReeferSection surface)
 *
 * Trailer profile reefer hours history must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Snapshot outages must surface
 * ListErrorState (never false-empty "No readings yet" on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-trailer-reefer-uses-paritytable";
const PAGE = "apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx";

const REQUIRED_LABELS = ["Recorded", "Hours", "Source", "Notes"];

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
  if (!src.includes('storageKey="trailer-reefer-hours-history"')) {
    errors.push(`${PAGE}: must set storageKey="trailer-reefer-hours-history"`);
  }
  if (!src.includes('tableTestId="reefer-hours-history"')) {
    errors.push(`${PAGE}: must keep tableTestId="reefer-hours-history"`);
  }
  if (!src.includes("No readings yet — record manually or run Samsara ingest.")) {
    errors.push(`${PAGE}: must keep emptyText for empty hours history`);
  }
  if (!src.includes("Couldn't load reefer hours")) {
    errors.push(`${PAGE}: must keep ListErrorState title for reefer outage`);
  }
  if (!src.includes("Record hours")) {
    errors.push(`${PAGE}: must keep manual Record hours entry`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    <ListErrorState title="Couldn't load reefer hours" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="trailer-reefer-hours-history"
      tableTestId="reefer-hours-history"
      emptyText="No readings yet — record manually or run Samsara ingest."
      columns={[
        { key: "recorded_at", label: "Recorded" },
        { key: "hours_reading", label: "Hours" },
        { key: "source_label", label: "Source" },
        { key: "notes", label: "Notes" },
      ]}
    />
    <button>Record hours</button>
  `;
  const bad = `
    export function TrailerReeferSection() {
      return (
        <div>
          <table data-testid="reefer-hours-history"><thead><tr><th>Recorded</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + reefer-hours-history testid preserved.`);
}

main();
