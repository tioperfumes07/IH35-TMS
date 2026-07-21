#!/usr/bin/env node
/**
 * verify-amortization-page-uses-paritytable — qbo-parity-a1 (AmortizationPage schedule surface)
 *
 * The stored amortization-schedule display grid must use the shared ParityTable grammar
 * (sort/resize/gear/pager), not a hand-rolled <table>. DISPLAY-ONLY migration (owner-greenlit
 * UI-only): the loan-create calculator inputs, createLoan/getLoanSchedule API calls, and the
 * dollars() cents formatting on Payment/Principal/Interest/Balance must all be preserved
 * exactly. Financial surface — this page must never gain posting/mutation logic in a UI
 * migration (schedule posting is a separate step by design).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-amortization-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/finance/AmortizationPage.tsx";

const REQUIRED_LABELS = ["#", "Due", "Payment", "Principal", "Interest", "Balance"];
const MONEY_RENDERS = [
  "dollars(r.payment_cents)",
  "dollars(r.principal_cents)",
  "dollars(r.interest_cents)",
  "dollars(r.remaining_balance_cents)",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  for (const render of MONEY_RENDERS) {
    if (!src.includes(render)) {
      errors.push(`${PAGE}: must keep cents formatting render: ${render}`);
    }
  }
  if (!src.includes('storageKey="finance-amortization-schedule"')) {
    errors.push(`${PAGE}: must set storageKey="finance-amortization-schedule"`);
  }
  if (!src.includes('tableTestId="amortization-schedule-table"')) {
    errors.push(`${PAGE}: must set tableTestId="amortization-schedule-table"`);
  }
  if (!src.includes("Select a loan to view its schedule.")) {
    errors.push(`${PAGE}: must keep the schedule empty-state text`);
  }
  if (!src.includes("createLoan(") || !src.includes("getLoanSchedule(")) {
    errors.push(`${PAGE}: display-only migration — createLoan/getLoanSchedule calls must remain untouched`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only surface migration — must not introduce useMutation (posting is a separate step)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const SCHEDULE_COLUMNS = [
      { key: "payment_number", label: "#" },
      { key: "due_date", label: "Due" },
      { key: "payment_cents", label: "Payment", render: (r) => dollars(r.payment_cents) },
      { key: "principal_cents", label: "Principal", render: (r) => dollars(r.principal_cents) },
      { key: "interest_cents", label: "Interest", render: (r) => dollars(r.interest_cents) },
      { key: "remaining_balance_cents", label: "Balance", render: (r) => dollars(r.remaining_balance_cents) },
    ];
    createLoan({});
    getLoanSchedule(id, companyId);
    <p>Select a loan to view its schedule.</p>
    <ParityTable
      storageKey="finance-amortization-schedule"
      tableTestId="amortization-schedule-table"
    />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function AmortizationPage() {
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
  console.log(
    `OK ${LABEL}: ${PAGE} schedule grid uses ParityTable; columns/formatting/calculator preserved; display-only.`,
  );
}

main();
