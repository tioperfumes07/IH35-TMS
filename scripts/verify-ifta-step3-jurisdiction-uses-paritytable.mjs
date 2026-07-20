#!/usr/bin/env node
/**
 * verify-ifta-step3-jurisdiction-uses-paritytable — qbo-parity-a1 (Step3JurisdictionCalc surface)
 *
 * IFTA Step 3 jurisdiction tax grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns State/Miles/Fuel gal/Rate/gal/Net taxable gal/Tax owed
 * preserved 1:1; rates link + fleet MPG header + total net tax footer preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-step3-jurisdiction-uses-paritytable";
const PAGE = "apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx";

const REQUIRED_LABELS = ["State", "Miles", "Fuel gal", "Rate/gal", "Net taxable gal", "Tax owed"];

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
  if (!src.includes('storageKey="ifta-step3-jurisdiction"')) {
    errors.push(`${PAGE}: must set storageKey="ifta-step3-jurisdiction"`);
  }
  if (!src.includes('data-ifta-step="3"')) {
    errors.push(`${PAGE}: must keep data-ifta-step="3" section marker`);
  }
  if (!src.includes("Step 3 · Jurisdiction tax calc")) {
    errors.push(`${PAGE}: must keep Step 3 section heading`);
  }
  if (!src.includes("IFTA tax matrix")) {
    errors.push(`${PAGE}: must keep IFTA tax matrix rates link`);
  }
  if (!src.includes("Fleet MPG:")) {
    errors.push(`${PAGE}: must keep Fleet MPG header line`);
  }
  if (!src.includes("Total net tax")) {
    errors.push(`${PAGE}: must keep Total net tax footer summary`);
  }
  if (!src.includes("Run preparation to compute jurisdiction taxes.")) {
    errors.push(`${PAGE}: must keep emptyText for unprepared filing`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../parity/ParityTable";
    const columns = [
      { key: "state", label: "State" },
      { key: "miles", label: "Miles" },
      { key: "fuel_gallons", label: "Fuel gal" },
      { key: "tax_rate_per_gallon", label: "Rate/gal" },
      { key: "net_taxable_gallons", label: "Net taxable gal" },
      { key: "tax_owed", label: "Tax owed" },
    ];
    export function Step3JurisdictionCalc({ filing }) {
      const data = filing.filing_data;
      return (
        <section data-ifta-step="3">
          <h3>Step 3 · Jurisdiction tax calc</h3>
          <a>IFTA tax matrix ({data.rates_quarter_key})</a>
          <span>Fleet MPG:</span>
          <ParityTable
            storageKey="ifta-step3-jurisdiction"
            emptyText="Run preparation to compute jurisdiction taxes."
            columns={columns}
          />
          <span>Total net tax</span>
        </section>
      );
    }
  `;
  const bad = `
    export function Step3JurisdictionCalc() {
      return (
        <section data-ifta-step="3">
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns State/Miles/Fuel gal/Rate/gal/Net taxable gal/Tax owed preserved.`,
  );
}

main();
