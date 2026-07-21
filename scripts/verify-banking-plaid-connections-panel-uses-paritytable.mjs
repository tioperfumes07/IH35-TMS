#!/usr/bin/env node
/**
 * verify-banking-plaid-connections-panel-uses-paritytable — banking Plaid connections panel
 * surface (verify-step 1164).
 *
 * Financial surface — owner greenlit a DISPLAY-ONLY ParityTable migration. The company bank
 * transactions list inside BankingPlaidConnectionsPanel.tsx (BankingCompanyTransactionsPanel)
 * must use the shared ParityTable grammar (sort/resize/gear), not a hand-rolled <table>.
 * The migration must preserve 1:1: the signed formatMoney(t.amount_cents, t.is_credit)
 * amount rendering (via formatUsdCents), the column order (Date, Description, Amount,
 * Account, Category, Matched to), the server-side CompanyTransactionsSort sort param (header
 * clicks keep driving setSort — the existing query key), the ListErrorBanner surface on the
 * connections query, the "Unable to load transactions." error literal on the transactions
 * query, the settled-only empty text (LIST-EMPTY-1 via useListState), and the connections
 * panel's inline Sync now / Disconnect / Reconnect controls with UNCHANGED handlers
 * (syncPlaidItem, disconnectPlaidItem, Owner-gated via canDisconnect). No posting/mutation
 * logic may be added or changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-plaid-connections-panel-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx";

const REQUIRED_LABELS = ["Date", "Description", "Amount", "Account", "Category", "Matched to"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("components/parity/ParityTable")) {
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
  if (!src.includes('storageKey="banking-company-transactions"')) {
    errors.push(`${PAGE}: must set storageKey="banking-company-transactions"`);
  }
  if (!src.includes('tableTestId="banking-company-transactions-table"')) {
    errors.push(`${PAGE}: must set tableTestId="banking-company-transactions-table"`);
  }
  if (!src.includes("No transactions found.")) {
    errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 guard literal)`);
  }
  if (!src.includes("useListState")) {
    errors.push(`${PAGE}: must keep the shared list-state primitive (settled-only empty invariant)`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep ListErrorBanner error surface on the connections query`);
  }
  if (!src.includes("Unable to load transactions.")) {
    errors.push(`${PAGE}: must keep the transactions query error literal`);
  }
  if (!src.includes("formatUsdCents")) {
    errors.push(`${PAGE}: display-only financial surface — must keep formatUsdCents amount rendering`);
  }
  if (!src.includes("formatMoney(t.amount_cents, t.is_credit)")) {
    errors.push(
      `${PAGE}: display-only financial surface — Amount cell must render formatMoney(t.amount_cents, t.is_credit) 1:1`,
    );
  }
  if (!src.includes("onSortChange")) {
    errors.push(`${PAGE}: header sort must stay server-driven via ParityTable controlled sort (onSortChange)`);
  }
  for (const sortKey of ['"date_desc"', '"date_asc"', '"amount_desc"', '"amount_asc"']) {
    if (!src.includes(sortKey)) {
      errors.push(`${PAGE}: server-side CompanyTransactionsSort mapping must keep ${sortKey}`);
    }
  }
  if (!src.includes("syncPlaidItem")) {
    errors.push(`${PAGE}: must keep the Sync now inline action (syncPlaidItem handler preserved)`);
  }
  if (!src.includes("disconnectPlaidItem")) {
    errors.push(`${PAGE}: must keep the Disconnect inline action (disconnectPlaidItem handler preserved)`);
  }
  if (!src.includes("canDisconnect")) {
    errors.push(`${PAGE}: Disconnect must stay Owner-gated via canDisconnect`);
  }
  if (!src.includes("PlaidReconnectButton")) {
    errors.push(`${PAGE}: must keep the Reconnect control (PlaidReconnectButton preserved)`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only migration — must not add useMutation (existing handlers stay as-is)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
    import { useListState } from "../../../components/list-state";
    import { formatUsdCents } from "../../../lib/money";
    import { disconnectPlaidItem, syncPlaidItem } from "../../../api/banking";
    import { PlaidReconnectButton } from "./PlaidReconnectButton";
    const canDisconnect = auth.user?.role === "Owner";
    const COLUMNS = [
      { key: "transaction_date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "amount_cents", label: "Amount", render: (t) => formatMoney(t.amount_cents, t.is_credit) },
      { key: "account", label: "Account" },
      { key: "category", label: "Category" },
      { key: "matched", label: "Matched to" },
    ];
    const handleSortChange = (key, direction) => {
      if (key === "transaction_date") setSort(direction === "asc" ? "date_asc" : "date_desc");
      else if (key === "amount_cents") setSort(direction === "asc" ? "amount_asc" : "amount_desc");
    };
    <ListErrorBanner onRetry={() => {}} />
    <p>Unable to load transactions.</p>
    <ParityTable
      storageKey="banking-company-transactions"
      tableTestId="banking-company-transactions-table"
      emptyText={txListState.isEmpty ? "No transactions found." : undefined}
      onSortChange={handleSortChange}
    />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function BankingCompanyTransactionsPanel() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Date</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns, signed amount formatting, server-side sort, inline connect/disconnect controls, error/empty surfaces preserved.`,
  );
}

main();
