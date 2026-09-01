#!/usr/bin/env node
/**
 * verify-earnings-section-uses-paritytable — qbo-parity-a1 (EarningsSection surface)
 *
 * Driver-finance settlement EarningsSection must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only surface (lines passed in
 * as props; no query/mutation in this component — the parent settlement page owns fetch
 * and error state). Columns Load / Source / Description / Miles / Rate / Amount preserved 1:1;
 * $X.XX amount formatting, em-dash fallbacks for Miles/Rate, and the Subtotal/Miles
 * footer line preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-earnings-section-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx";

const REQUIRED_LABELS = ["Load", "Source", "Description", "Miles", "Rate", "Amount"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
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
  if (!src.includes('storageKey="driver-finance-earnings-section"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-earnings-section"`);
  }
  if (!src.includes('tableTestId="earnings-section-table"')) {
    errors.push(`${PAGE}: must set tableTestId="earnings-section-table"`);
  }
  if (!src.includes("${Number(line.amount).toFixed(2)}")) {
    errors.push(`${PAGE}: must keep $X.XX amount rendering (Number(line.amount).toFixed(2))`);
  }
  if (!src.includes('line.miles ?? "—"') || !src.includes('line.rate ?? "—"')) {
    errors.push(`${PAGE}: must keep em-dash fallback for Miles and Rate`);
  }
  if (!src.includes("Subtotal: ${subtotal.toFixed(2)}")) {
    errors.push(`${PAGE}: must keep Subtotal footer line ($ + toFixed(2))`);
  }
  if (!src.includes("Miles: {totalMiles}")) {
    errors.push(`${PAGE}: must keep total Miles footer segment`);
  }
  if (!src.includes('label: "Source"')) {
    errors.push(`${PAGE}: must expose Source column for settlement earnings lines (SRC-02)`);
  }
  if (!/source_label/.test(src)) {
    errors.push(`${PAGE}: Source column must read source_label from the parent mapper (SRC-02)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "id", label: "Load" },
      { key: "source_label", label: "Source" },
      { key: "description", label: "Description" },
      { key: "miles", label: "Miles", render: (line) => <>{line.miles ?? "—"}</> },
      { key: "rate", label: "Rate", render: (line) => <>{line.rate ?? "—"}</> },
      { key: "amount", label: "Amount", render: (line) => <>\${Number(line.amount).toFixed(2)}</> },
    ];
    <ParityTable
      storageKey="driver-finance-earnings-section"
      tableTestId="earnings-section-table"
    />
    <div>Subtotal: \${subtotal.toFixed(2)} · Miles: {totalMiles}</div>
  `;
  const bad = `
    export function EarningsSection() {
      return (
        <section>
          <table><thead><tr><th>Load</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; Load/Description/Miles/Rate/Amount preserved.`);
}

main();
