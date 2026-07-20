#!/usr/bin/env node
/**
 * verify-ifta-step2-fuel-uses-paritytable — qbo-parity-a1 (Step2FuelReview surface)
 *
 * IFTA Step 2 fuel review grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns State/Aggregated gallons/Override gallons preserved
 * 1:1; override number inputs + Save fuel overrides + Total summary preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-step2-fuel-uses-paritytable";
const PAGE = "apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx";

const REQUIRED_LABELS = ["State", "Aggregated gallons", "Override gallons"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../parity/ParityTable"') &&
    !src.includes("from '../../parity/ParityTable'")
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
  if (!src.includes('storageKey="ifta-step2-fuel"')) {
    errors.push(`${PAGE}: must set storageKey="ifta-step2-fuel"`);
  }
  if (!src.includes('data-ifta-step="2"')) {
    errors.push(`${PAGE}: must keep data-ifta-step="2" section marker`);
  }
  if (!src.includes("Step 2 · Fuel review")) {
    errors.push(`${PAGE}: must keep Step 2 section heading`);
  }
  if (!src.includes("Save fuel overrides")) {
    errors.push(`${PAGE}: must keep Save fuel overrides action`);
  }
  if (!src.includes("ifta-fuel-override-")) {
    errors.push(`${PAGE}: must keep ifta-fuel-override-* input testids`);
  }
  if (!src.includes('type="number"')) {
    errors.push(`${PAGE}: must keep number override inputs`);
  }
  if (!src.includes("onSaveOverrides")) {
    errors.push(`${PAGE}: must keep onSaveOverrides override save path`);
  }
  if (!src.includes(">Total<") && !src.includes(">Total</")) {
    // Total label appears as text node in summary footer
    if (!src.includes("Total")) {
      errors.push(`${PAGE}: must keep Total gallons summary`);
    }
  }
  if (!src.includes("No fuel data for this quarter.")) {
    errors.push(`${PAGE}: must keep emptyText for empty fuel quarter`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../parity/ParityTable";
    const columns = [
      { key: "state", label: "State" },
      { key: "aggregated", label: "Aggregated gallons" },
      { key: "override", label: "Override gallons" },
    ];
    export function Step2FuelReview({ filing, onSaveOverrides }) {
      return (
        <section data-ifta-step="2">
          <h3>Step 2 · Fuel review</h3>
          <ParityTable
            storageKey="ifta-step2-fuel"
            emptyText="No fuel data for this quarter."
            columns={columns}
          />
          <span>Total</span>
          <input type="number" data-testid={\`ifta-fuel-override-\${state}\`} />
          <button onClick={() => onSaveOverrides({})}>Save fuel overrides</button>
        </section>
      );
    }
  `;
  const bad = `
    export function Step2FuelReview() {
      return (
        <section data-ifta-step="2">
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
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns State/Aggregated gallons/Override gallons preserved.`,
  );
}

main();
