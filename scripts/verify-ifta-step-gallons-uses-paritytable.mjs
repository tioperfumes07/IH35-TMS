#!/usr/bin/env node
/**
 * Locks IFTA Step 2 state-gallons grid to shared ParityTable grammar.
 * State, Gallons, Source, and Breakdown columns must remain intact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-step-gallons-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/ifta/IFTAStepGallons.tsx";
const REQUIRED_LABELS = ["State", "Gallons", "Source", "Breakdown"];

function assertMigrated(source) {
  const errors = [];
  if (
    !source.includes('from "../../../components/parity/ParityTable"') &&
    !source.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((source.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(source) || /<thead[\s>]/.test(source)) {
    errors.push(`${PAGE}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!source.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing preserved column label: ${label}`);
    }
  }
  if (!source.includes('storageKey="ifta-step-gallons"')) {
    errors.push(`${PAGE}: must set storageKey="ifta-step-gallons"`);
  }
  if (!source.includes("Step 2 · State gallons")) {
    errors.push(`${PAGE}: must keep Step 2 state-gallons heading`);
  }
  if (!source.includes("No gallons aggregated yet — run Step 2.")) {
    errors.push(`${PAGE}: must keep the empty state`);
  }
  if (!source.includes("Total gallons:")) {
    errors.push(`${PAGE}: must keep total-gallons summary`);
  }
  if (!source.includes("useToast") || !source.includes("onError:")) {
    errors.push(`${PAGE}: runMutation must surface failures via toast onError (FINDING 50210)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "state", label: "State" },
      { key: "gallons", label: "Gallons" },
      { key: "source", label: "Source" },
      { key: "breakdown", label: "Breakdown" },
    ];
    export function IFTAStepGallons() {
      return (
        <section>
          <h3>Step 2 · State gallons</h3>
          <ParityTable storageKey="ifta-step-gallons" columns={columns} emptyText="No gallons aggregated yet — run Step 2." />
          <p>Total gallons:</p>
        </section>
      );
    }
    onError: () => {}
    useToast
  `;
  const bad = `
    export function IFTAStepGallons() {
      return <table><thead><tr><th>State</th></tr></thead></table>;
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
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(source);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; State/Gallons/Source/Breakdown columns preserved.`);
}

main();
