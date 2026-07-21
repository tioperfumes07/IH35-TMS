#!/usr/bin/env node
/**
 * verify-bank-tx-categorization-page-uses-paritytable — banking categorization surface (Workflow-B, @archived).
 *
 * BankTxCategorizationPage must use the shared ParityTable grammar, not a hand-rolled
 * <table>. Display-only migration: column order (bulk checkbox, Date, Account,
 * Description, Amount, Suggested, Quick actions), amount formatting via
 * formatMoneyCents, and every inline action (Apply suggestion, Categorize-as
 * SelectCombobox + Apply, Create manual JE, Mark as transfer, Skip / investigate)
 * must be preserved with unchanged handlers (precedent: CashGlSetup 1156,
 * CoaRoles 1144). The page stays @archived — Workflow-B (not route-wired;
 * enforced separately by verify-banking-workflow-b-archived.mjs) and keeps the
 * ListErrorBanner error surface.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-tx-categorization-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx";

const REQUIRED_LABELS = ["Date", "Account", "Description", "Amount", "Suggested", "Quick actions"];
const REQUIRED_ACTIONS = ["Apply suggestion", "Create manual JE", "Mark as transfer", "Skip / investigate"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
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
  for (const action of REQUIRED_ACTIONS) {
    if (!src.includes(action)) {
      errors.push(`${PAGE}: missing inline action: "${action}"`);
    }
  }
  if (!src.includes('storageKey="banking-tx-categorization"')) {
    errors.push(`${PAGE}: must set storageKey="banking-tx-categorization"`);
  }
  if (!src.includes('tableTestId="bank-tx-categorization-table"')) {
    errors.push(`${PAGE}: must set tableTestId="bank-tx-categorization-table"`);
  }
  if (!src.includes("SelectCombobox")) {
    errors.push(`${PAGE}: must keep the inline Categorize-as SelectCombobox`);
  }
  if (!src.includes("formatMoneyCents")) {
    errors.push(`${PAGE}: must keep formatMoneyCents amount formatting`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep the ListErrorBanner error surface on query error`);
  }
  if (!src.includes("No uncategorized transactions for these filters.")) {
    errors.push(`${PAGE}: must keep the empty text "No uncategorized transactions for these filters."`);
  }
  if (!src.includes("@archived — Workflow-B")) {
    errors.push(`${PAGE}: must keep the "@archived — Workflow-B" annotation`);
  }
  return errors;
}

function selftest() {
  const good = `
    // @archived — Workflow-B: superseded by BankingTransactionsDesignView.
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    import { SelectCombobox } from "../../components/shared/SelectCombobox";
    const columns = [
      { key: "bulk_select", label: "" },
      { key: "transaction_date", label: "Date" },
      { key: "bank_account_name", label: "Account" },
      { key: "description", label: "Description" },
      { key: "amount_cents", label: "Amount", render: (tx) => formatMoneyCents(txAmountCents(tx)) },
      { key: "suggested", label: "Suggested", render: () => <Button>Apply suggestion</Button> },
      { key: "quick_actions", label: "Quick actions", render: () => (
        <><SelectCombobox /><Button>Create manual JE</Button><Button>Mark as transfer</Button><Button>Skip / investigate</Button></>
      ) },
    ];
    <ListErrorBanner message="Could not load uncategorized transactions." onRetry={() => {}} />
    <ParityTable
      storageKey="banking-tx-categorization"
      tableTestId="bank-tx-categorization-table"
      emptyText="No uncategorized transactions for these filters."
    />
  `;
  const bad = `
    export function BankTxCategorizationPage() {
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/inline actions/error surface preserved; still @archived.`);
}

main();
