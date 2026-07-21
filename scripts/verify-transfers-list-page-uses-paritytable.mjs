#!/usr/bin/env node
/**
 * verify-transfers-list-page-uses-paritytable — banking TransfersListPage surface (verify-step 1155)
 *
 * Financial surface — owner greenlit a DISPLAY-ONLY ParityTable migration. The banking transfers
 * list must use the shared ParityTable grammar (sort/resize/gear), not a hand-rolled <table>.
 * The migration must preserve 1:1: the formatUsdCents amount rendering, the EntityLink From/To
 * cells, the QBO Status pills, the View/Revoke inline actions (revoke stays Owner-gated via
 * canRevoke), the ListErrorBanner error surface, the settled-only empty text (LIST-EMPTY-1),
 * and the server-side offset pager. No posting/mutation logic may be added or changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-transfers-list-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/banking/TransfersListPage.tsx";

const REQUIRED_LABELS = ["Date", "Type", "From", "To", "Amount", "Memo", "Reference", "QBO Status", "Actions"];

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
  if (!src.includes('storageKey="banking-transfers-list"')) {
    errors.push(`${PAGE}: must set storageKey="banking-transfers-list"`);
  }
  if (!src.includes('tableTestId="banking-transfers-list-table"')) {
    errors.push(`${PAGE}: must set tableTestId="banking-transfers-list-table"`);
  }
  if (!src.includes("No transfers found for this filter.")) {
    errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 guard literal)`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep ListErrorBanner error surface on query error`);
  }
  if (!src.includes("formatUsdCents")) {
    errors.push(`${PAGE}: display-only financial surface — must keep formatUsdCents amount rendering`);
  }
  if (!src.includes("formatMoney(Number(row.amount_cents))")) {
    errors.push(`${PAGE}: display-only financial surface — Amount cell must render formatMoney(Number(row.amount_cents)) 1:1`);
  }
  if (!src.includes("revokeTransfer")) {
    errors.push(`${PAGE}: must keep the Revoke inline action (revokeTransfer handler preserved)`);
  }
  if (!src.includes("canRevoke")) {
    errors.push(`${PAGE}: Revoke must stay Owner-gated via canRevoke`);
  }
  if (!src.includes("getTransfer")) {
    errors.push(`${PAGE}: must keep the View inline action (getTransfer detail handler preserved)`);
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
    import { formatUsdCents } from "../../lib/money";
    import { getTransfer, revokeTransfer } from "../../api/banking";
    const canRevoke = auth.user?.role === "Owner";
    const COLUMNS = [
      { key: "transfer_date", label: "Date" },
      { key: "transfer_type", label: "Type" },
      { key: "from_account_id", label: "From" },
      { key: "to_account_id", label: "To" },
      { key: "amount_cents", label: "Amount", render: (row) => formatMoney(Number(row.amount_cents)) },
      { key: "memo", label: "Memo" },
      { key: "reference_number", label: "Reference" },
      { key: "qbo_status", label: "QBO Status" },
      { key: "actions", label: "Actions" },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable
      storageKey="banking-transfers-list"
      tableTestId="banking-transfers-list-table"
      emptyText={listState.isEmpty ? "No transfers found for this filter." : undefined}
    />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function TransfersListPage() {
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns, amount formatting, inline actions, error/empty surfaces preserved.`);
}

main();
