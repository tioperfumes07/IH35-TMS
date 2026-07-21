#!/usr/bin/env node
/**
 * verify-multi-entity-accounting-page-uses-paritytable — qbo-parity-a1 (MultiEntityAccountingPage)
 *
 * Multi-entity consolidated accounting summary page must use the shared ParityTable grammar
 * (sort/resize/gear) for BOTH read-only grids (per-company summary + consolidated account
 * balances), not hand-rolled <table>. Display-only migration — the summary query, money()
 * cents formatting, and column order are preserved 1:1. Load failures must surface
 * ListErrorState (never false-empty on outage).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-multi-entity-accounting-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx";

const BY_COMPANY_LABELS = ["Company", "Revenue", "Expense", "Net income"];
const ACCOUNT_LABELS = ["Account", "Type", "Debit", "Credit"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (by-company summary + account balances)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of BY_COMPANY_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing by-company column label: "${label}"`);
    }
  }
  for (const label of ACCOUNT_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing account-balances column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="multi-entity-accounting-by-company"')) {
    errors.push(`${PAGE}: must set storageKey="multi-entity-accounting-by-company"`);
  }
  if (!src.includes('storageKey="multi-entity-accounting-accounts"')) {
    errors.push(`${PAGE}: must set storageKey="multi-entity-accounting-accounts"`);
  }
  if (!src.includes('tableTestId="multi-entity-by-company-table"')) {
    errors.push(`${PAGE}: must set tableTestId for the by-company grid`);
  }
  if (!src.includes('tableTestId="multi-entity-accounts-table"')) {
    errors.push(`${PAGE}: must set tableTestId for the account-balances grid`);
  }
  if (!src.includes("Couldn't load consolidated summary")) {
    errors.push(`${PAGE}: must keep ListErrorState title for the consolidated summary outage`);
  }
  // Display-only invariant: cents formatting stays on the shared money() helper.
  if (!src.includes("function money(")) {
    errors.push(`${PAGE}: must keep the money() cents formatter`);
  }
  for (const cents of ["revenue_cents", "expense_cents", "net_income_cents", "debit_cents", "credit_cents"]) {
    if (!src.includes(`money(row.${cents})`)) {
      errors.push(`${PAGE}: must render ${cents} through money() exactly as before`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    function money(cents) { return String(cents); }
    const byCompanyColumns = [
      { key: "company_name", label: "Company" },
      { key: "revenue_cents", label: "Revenue", render: (row) => money(row.revenue_cents) },
      { key: "expense_cents", label: "Expense", render: (row) => money(row.expense_cents) },
      { key: "net_income_cents", label: "Net income", render: (row) => money(row.net_income_cents) },
    ];
    const accountColumns = [
      { key: "account_name", label: "Account" },
      { key: "account_type", label: "Type" },
      { key: "debit_cents", label: "Debit", render: (row) => money(row.debit_cents) },
      { key: "credit_cents", label: "Credit", render: (row) => money(row.credit_cents) },
    ];
    <ListErrorState title="Couldn't load consolidated summary" status={0} onRetry={() => {}} />
    <ParityTable storageKey="multi-entity-accounting-by-company" tableTestId="multi-entity-by-company-table" />
    <ParityTable storageKey="multi-entity-accounting-accounts" tableTestId="multi-entity-accounts-table" />
  `;
  const bad = `
    export function MultiEntityAccountingPage() {
      return (
        <div>
          <table><thead><tr><th>Company</th></tr></thead></table>
        </div>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + money() rendering preserved.`);
}

main();
