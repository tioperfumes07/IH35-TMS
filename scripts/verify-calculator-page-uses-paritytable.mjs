#!/usr/bin/env node
/**
 * verify-calculator-page-uses-paritytable — qbo-parity-a1 (CalculatorPage amortization preview)
 *
 * The Finance Calculator amortization-preview table must use the shared ParityTable grammar,
 * not a hand-rolled <table>. Display-only migration on a money-adjacent surface: the page is
 * a pure what-if calculator (nothing saved or posted) and must stay that way — no useMutation,
 * no query-key/API changes. The dollars() cents formatting, column order (# / Due / Principal /
 * Interest / Balance), scenario <dl> summary, and the inline compute-error surface are preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-calculator-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/finance/CalculatorPage.tsx";

const REQUIRED_LABELS = ["#", "Due", "Principal", "Interest", "Balance"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
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
  if (!src.includes('storageKey="finance-calculator-amortization"')) {
    errors.push(`${PAGE}: must set storageKey="finance-calculator-amortization"`);
  }
  if (!src.includes('tableTestId="finance-calculator-amortization-table"')) {
    errors.push(`${PAGE}: must set tableTestId="finance-calculator-amortization-table"`);
  }
  if (!src.includes("dollars(r.principal_cents)")) {
    errors.push(`${PAGE}: must keep dollars() cents formatting in the Principal column render`);
  }
  if (!src.includes("Pure calculation — nothing is saved or posted.")) {
    errors.push(`${PAGE}: must keep the pure-calculation (no posting) subtitle`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: pure calculator surface — must not add mutations (nothing is saved or posted)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const dollars = (c) => c;
    const AMORT_COLUMNS = [
      { key: "period", label: "#" },
      { key: "date", label: "Due" },
      { key: "principal_cents", label: "Principal", render: (r) => dollars(r.principal_cents) },
      { key: "interest_cents", label: "Interest", render: (r) => dollars(r.interest_cents) },
      { key: "balance_cents", label: "Balance", render: (r) => dollars(r.balance_cents) },
    ];
    <p>Model a financed purchase before committing. Pure calculation — nothing is saved or posted.</p>
    <ParityTable
      columns={AMORT_COLUMNS}
      storageKey="finance-calculator-amortization"
      tableTestId="finance-calculator-amortization-table"
    />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function CalculatorPage() {
      return (
        <table className="w-full text-xs">
          <thead><tr><th>#</th><th>Due</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/formatting preserved; pure calculator (no mutations).`);
}

main();
