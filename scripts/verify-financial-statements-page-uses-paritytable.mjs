#!/usr/bin/env node
/**
 * verify-financial-statements-page-uses-paritytable — qbo-parity-a1 (FinancialStatementsPage surface)
 *
 * FIN-19 Finance-Hub financial statements (P&L / Balance Sheet / Trial Balance) must use the
 * shared ParityTable grammar, not hand-rolled <table>s. DISPLAY-ONLY migration on a
 * money-adjacent report surface: the money() USD formatting, the account-register drill-through,
 * every section total / footer label ("Section total", "Total assets", "Total liabilities",
 * "Current year earnings", "Total equity", "Grand total"), the CSV export, and the ?tab= URL
 * sync must all be preserved. Read-only — this page has no mutations and must stay that way
 * (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-financial-statements-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx";

const REQUIRED_LABELS = ["Account #", "Account", "Type", "Amount", "Debits", "Credits", "Net"];

const REQUIRED_STORAGE_KEYS = [
  "fin19-pl-revenue",
  "fin19-pl-cogs",
  "fin19-pl-expenses",
  "fin19-bs-assets",
  "fin19-bs-liabilities",
  "fin19-bs-equity",
  "fin19-trial-balance",
];

const REQUIRED_TOTAL_LABELS = [
  "Section total",
  "Total assets",
  "Total liabilities",
  "Current year earnings",
  "Total equity",
  "Grand total",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (statement sections + trial balance)`);
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
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(`"${key}"`)) {
      errors.push(`${PAGE}: missing distinct storageKey "${key}"`);
    }
  }
  for (const total of REQUIRED_TOTAL_LABELS) {
    if (!src.includes(total)) {
      errors.push(`${PAGE}: missing preserved total/footer label: "${total}"`);
    }
  }
  if (!src.includes('currency: "USD"')) {
    errors.push(`${PAGE}: must keep the money() USD currency formatter`);
  }
  if (!src.includes("account-register")) {
    errors.push(`${PAGE}: must keep the AccountCell account-register drill-through`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("downloadCsv(")) {
    errors.push(`${PAGE}: must keep the CSV export`);
  }
  if (!src.includes("parseFinancialStatementsTab")) {
    errors.push(`${PAGE}: must keep the ?tab= URL sync (parseFinancialStatementsTab)`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only statements surface — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    function money(cents) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
    export function parseFinancialStatementsTab(raw) { return raw; }
    function downloadCsv(name, rows) {}
    const COLUMNS = [
      { key: "account_code", label: "Account #" },
      { key: "account_name", label: "Account" },
      { key: "account_type", label: "Type" },
      { key: "amount", label: "Amount" },
      { key: "total_debits", label: "Debits" },
      { key: "total_credits", label: "Credits" },
      { key: "net_balance", label: "Net" },
    ];
    const link = <Link to="/accounting/account-register" />;
    const footers = ["Section total", "Total assets", "Total liabilities", "Current year earnings", "Total equity", "Grand total"];
    const keys = ["fin19-pl-revenue", "fin19-pl-cogs", "fin19-pl-expenses", "fin19-bs-assets", "fin19-bs-liabilities", "fin19-bs-equity", "fin19-trial-balance"];
    <ListErrorState title="Could not load trial balance." status={0} onRetry={() => {}} />
    <ParityTable storageKey="fin19-trial-balance" />
    <ParityTable storageKey={storageKey} />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function FinancialStatementsPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Account #</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; totals/drill-through/CSV/tab-sync preserved; read-only.`);
}

main();
