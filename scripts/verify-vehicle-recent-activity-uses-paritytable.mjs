#!/usr/bin/env node
/**
 * verify-vehicle-recent-activity-uses-paritytable — qbo-parity-a1 (RecentActivitySection)
 *
 * Vehicle profile recent-activity feed must use shared ParityTable grammar
 * (sort/resize/gear/paging), not a hand-rolled <table>. Record column + Loads /
 * Status changes / Work orders tab filterBar preserved; vehicle-recent-activity
 * testid retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vehicle-recent-activity-uses-paritytable";
const PAGE = "apps/frontend/src/components/vehicle-profile/RecentActivitySection.tsx";

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
  if (!src.includes('label: "Record"')) {
    errors.push(`${PAGE}: missing column label: "Record"`);
  }
  if (!src.includes("Loads") || !src.includes("Status changes") || !src.includes("Work orders")) {
    errors.push(`${PAGE}: must keep Loads / Status changes / Work orders tab labels`);
  }
  if (!src.includes("vehicle-recent-activity")) {
    errors.push(`${PAGE}: must preserve data-testid="vehicle-recent-activity"`);
  }
  if (!src.includes('emptyText="No records."')) {
    errors.push(`${PAGE}: must keep emptyText="No records."`);
  }
  if (!src.includes("storageKey={`vehicle-recent-activity-${tab}`}") && !src.includes('storageKey="vehicle-recent-activity')) {
    errors.push(`${PAGE}: must set storageKey for vehicle-recent-activity`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [{ key: "preview", label: "Record" }];
    <section data-testid="vehicle-recent-activity">
      <ParityTable storageKey={\`vehicle-recent-activity-\${tab}\`} emptyText="No records." />
      Loads Status changes Work orders
    </section>
  `;
  const bad = `
    export function RecentActivitySection() {
      return (
        <section>
          <table><thead><tr><th>Record</th></tr></thead></table>
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
