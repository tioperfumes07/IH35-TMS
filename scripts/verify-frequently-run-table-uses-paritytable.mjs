#!/usr/bin/env node
/**
 * verify-frequently-run-table-uses-paritytable — qbo-parity-a1 (FrequentlyRunTable surface)
 *
 * Reports Home "Frequently run" list must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Report / Filters / Runs preserved; Run stays a button
 * in the Report cell; stub P4/P5 badges preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-frequently-run-table-uses-paritytable";
const PAGE = "apps/frontend/src/components/reports/FrequentlyRunTable.tsx";

const REQUIRED_LABELS = ["Report", "Filters", "Runs"];

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
  if (!src.includes('storageKey="reports-frequently-run"')) {
    errors.push(`${PAGE}: must set storageKey="reports-frequently-run"`);
  }
  if (!src.includes("onRun")) {
    errors.push(`${PAGE}: must keep onRun Run action on Report name`);
  }
  if (!src.includes('row.id === "ar-aging" ? "P5" : "P4"')) {
    errors.push(`${PAGE}: must keep stub P4/P5 badge for status==="stub"`);
  }
  if (!src.includes("Frequently run")) {
    errors.push(`${PAGE}: must keep section heading Frequently run`);
  }
  if (!src.includes("No frequently run reports yet.")) {
    errors.push(`${PAGE}: must keep emptyText for empty frequently-run list`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const columns = [
      { key: "name", label: "Report" },
      { key: "filters", label: "Filters" },
      { key: "runs", label: "Runs" },
    ];
    function FrequentlyRunTable({ rows, onRun }) {
      return (
        <section>
          <h3>Frequently run</h3>
          <ParityTable
            storageKey="reports-frequently-run"
            emptyText="No frequently run reports yet."
            columns={columns}
            rows={rows}
          />
          <button onClick={() => onRun(row)}>{row.name}</button>
          {row.status === "stub" ? (row.id === "ar-aging" ? "P5" : "P4") : null}
        </section>
      );
    }
  `;
  const bad = `
    export function FrequentlyRunTable() {
      return (
        <section>
          <table><thead><tr><th>Report</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns Report/Filters/Runs preserved.`);
}

main();
