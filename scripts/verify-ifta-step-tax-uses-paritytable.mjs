#!/usr/bin/env node
/**
 * verify-ifta-step-tax-uses-paritytable — qbo-parity-a1 (IFTAStepTax surface)
 *
 * IFTA preparation Step 3 tax grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns State/Miles/Taxable gal/Paid gal/Net gal/Rate/Tax/Credit
 * preserved 1:1; calculate action, last-calculated timestamp, and total net tax summary preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-step-tax-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/ifta/IFTAStepTax.tsx";

const REQUIRED_LABELS = ["State", "Miles", "Taxable gal", "Paid gal", "Net gal", "Rate", "Tax/Credit"];

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
  if (!source.includes('storageKey="ifta-step-tax"')) {
    errors.push(`${PAGE}: must set storageKey="ifta-step-tax"`);
  }
  if (!source.includes("Step 3 · Tax owed")) {
    errors.push(`${PAGE}: must keep Step 3 tax heading`);
  }
  if (!source.includes("Run Step 3 — calculate tax")) {
    errors.push(`${PAGE}: must keep calculate-tax action button`);
  }
  if (!source.includes("No tax rows yet — run Step 3 after Steps 1+2.")) {
    errors.push(`${PAGE}: must keep the empty state`);
  }
  if (!source.includes("Total net tax:")) {
    errors.push(`${PAGE}: must keep total net tax summary`);
  }
  if (!source.includes("text-green-700")) {
    errors.push(`${PAGE}: must keep credit (negative tax) green styling`);
  }
  if (!source.includes("useToast") || !source.includes("onError:")) {
    errors.push(`${PAGE}: runMutation must surface failures via toast onError (FINDING 50211)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "state", label: "State" },
      { key: "miles_in_state", label: "Miles" },
      { key: "taxable_gallons", label: "Taxable gal" },
      { key: "gallons_purchased_in_state", label: "Paid gal" },
      { key: "net_taxable_gallons", label: "Net gal" },
      { key: "tax_rate_per_gallon", label: "Rate" },
      { key: "tax_owed", label: "Tax/Credit" },
    ];
    export function IFTAStepTax() {
      return (
        <section>
          <h3>Step 3 · Tax owed</h3>
          <button>Run Step 3 — calculate tax</button>
          <ParityTable storageKey="ifta-step-tax" columns={columns} emptyText="No tax rows yet — run Step 3 after Steps 1+2." />
          <p>Total net tax:</p>
          <span className="text-green-700" />
        </section>
      );
    }
    onError: () => {}
    useToast
  `;
  const bad = `
    export function IFTAStepTax() {
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
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable; State/Miles/Taxable gal/Paid gal/Net gal/Rate/Tax/Credit columns preserved.`,
  );
}

main();
