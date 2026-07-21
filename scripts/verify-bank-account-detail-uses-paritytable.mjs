#!/usr/bin/env node
/**
 * verify-bank-account-detail-uses-paritytable — banking BankAccountDetail surface (verify-step 1163)
 *
 * Financial surface — owner greenlit a DISPLAY-ONLY ParityTable migration. The archived read-only
 * bank-account transactions table (ArchivedBankAccountDetailTable, @archived, never mounted) must use
 * the shared ParityTable grammar, not a hand-rolled <table>. The migration must preserve 1:1: the
 * column order (Date / Description / Amount / Category / Matched), the is_credit-aware signed amount
 * rendering (formatBankTransactionSignedAmount via spentReceived + formatUsdCents — the 0441-mod8
 * guard's invariant), the EntityLink Matched cells, the ListErrorBanner error surface, the
 * settled-only empty text (LIST-EMPTY-1), and the server-side offset pager. The live route surface
 * must keep mounting the categorize-capable register (BankingTransactionsDesignView) and the
 * @archived marker must survive (Doc-18 keystone + §7 additive). No posting/mutation logic may be
 * added or changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-account-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";

const REQUIRED_LABELS = ["Date", "Description", "Amount", "Category", "Matched"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (!src.includes('storageKey="banking-bank-account-detail-archived"')) {
    errors.push(`${PAGE}: must set storageKey="banking-bank-account-detail-archived"`);
  }
  if (!src.includes('tableTestId="bank-account-detail-archived-table"')) {
    errors.push(`${PAGE}: must set tableTestId="bank-account-detail-archived-table"`);
  }
  if (!src.includes("No transactions found for this filter.")) {
    errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 guard literal)`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep ListErrorBanner error surface on query error`);
  }
  if (!src.includes("formatBankTransactionSignedAmount(row)")) {
    errors.push(`${PAGE}: display-only financial surface — Amount cell must render formatBankTransactionSignedAmount(row) 1:1 (is_credit-aware)`);
  }
  if (!src.includes("spentReceived(")) {
    errors.push(`${PAGE}: must keep the spentReceived is_credit convention (0441-mod8 invariant)`);
  }
  if (!src.includes("formatUsdCents")) {
    errors.push(`${PAGE}: display-only financial surface — must keep formatUsdCents amount rendering`);
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must keep the EntityLink Matched cells (load/bill/settlement drill-through)`);
  }
  if (!src.includes("@archived")) {
    errors.push(`${PAGE}: the archived-table marker must survive (§7 additive; Doc-18 keystone guard relies on it)`);
  }
  if (!src.includes("<BankingTransactionsDesignView")) {
    errors.push(`${PAGE}: the live route surface must keep mounting the categorize-capable register (BankingTransactionsDesignView)`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only migration — must not add useMutation (existing handlers stay as-is)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    import { EntityLink } from "../../components/shared/EntityLink";
    import { formatUsdCents } from "../../lib/money";
    import { BankingTransactionsDesignView, spentReceived } from "./components/BankingTransactionsDesignView";
    export function formatBankTransactionSignedAmount(tx) {
      const { spent, received } = spentReceived(tx);
      return received > 0 ? formatUsdCents(received) : formatUsdCents(-spent);
    }
    <BankingTransactionsDesignView selectedAccountId={id} />
    // @archived — prior inert table
    const COLUMNS = [
      { key: "transaction_date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "amount_cents", label: "Amount", render: (row) => formatBankTransactionSignedAmount(row) },
      { key: "plaid_category", label: "Category" },
      { key: "matched", label: "Matched" },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable
      storageKey="banking-bank-account-detail-archived"
      tableTestId="bank-account-detail-archived-table"
      emptyText={listState.isEmpty ? "No transactions found for this filter." : undefined}
    />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function ArchivedBankAccountDetailTable() {
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
  console.log(`OK ${LABEL}: ${PAGE} archived table uses ParityTable; columns, signed-amount formatting, EntityLink cells, @archived marker, live register mount, and error/empty surfaces preserved.`);
}

main();
