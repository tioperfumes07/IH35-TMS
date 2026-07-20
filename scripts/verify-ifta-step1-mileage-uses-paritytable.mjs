#!/usr/bin/env node
/**
 * verify-ifta-step1-mileage-uses-paritytable — qbo-parity-a1 (IFTA Step1MileageReview)
 *
 * IFTA Step 1 mileage review grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Columns State / Aggregated
 * miles / Override miles preserved 1:1; override number inputs + save + total
 * summary retained. Form-only (no query failure path → no ListErrorState).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-step1-mileage-uses-paritytable";
const PAGE = "apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx";

const REQUIRED_LABELS = ["State", "Aggregated miles", "Override miles"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../parity/ParityTable"') &&
    !src.includes("from '../../parity/ParityTable'")
  ) {
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
  if (!src.includes('storageKey="ifta-step1-mileage-review"')) {
    errors.push(`${PAGE}: must set storageKey="ifta-step1-mileage-review"`);
  }
  if (!src.includes("ifta-step1-mileage-table")) {
    errors.push(`${PAGE}: must set tableTestId="ifta-step1-mileage-table"`);
  }
  if (!src.includes('emptyText="No mileage data for this quarter."')) {
    errors.push(`${PAGE}: must keep emptyText for empty quarter mileage`);
  }
  if (!src.includes("ifta-miles-override-")) {
    errors.push(`${PAGE}: must preserve override input data-testid prefix ifta-miles-override-`);
  }
  if (!src.includes('type="number"') || !src.includes("min={0}") || !src.includes('step="0.1"')) {
    errors.push(`${PAGE}: must preserve override number input (type=number, min=0, step=0.1)`);
  }
  if (!src.includes("Save mileage overrides")) {
    errors.push(`${PAGE}: must preserve Save mileage overrides action`);
  }
  if (!src.includes("Total:")) {
    errors.push(`${PAGE}: must preserve Total miles summary`);
  }
  if (!src.includes('data-ifta-step="1"')) {
    errors.push(`${PAGE}: must keep data-ifta-step="1"`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../parity/ParityTable";
    const columns = [
      { key: "state", label: "State" },
      { key: "aggregatedMiles", label: "Aggregated miles" },
      { key: "overrideMiles", label: "Override miles" },
    ];
    <section data-ifta-step="1">
      <ParityTable
        storageKey="ifta-step1-mileage-review"
        tableTestId="ifta-step1-mileage-table"
        emptyText="No mileage data for this quarter."
      />
      <input type="number" min={0} step="0.1" data-testid={\`ifta-miles-override-\${row.state}\`} />
      <div>Total: {fmtNum(total)}</div>
      <button>Save mileage overrides</button>
    </section>
  `;
  const bad = `
    export function Step1MileageReview() {
      return (
        <section data-ifta-step="1">
          <table><thead><tr><th>State</th></tr></thead></table>
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
