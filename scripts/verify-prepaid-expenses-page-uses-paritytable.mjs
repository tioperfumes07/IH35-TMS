#!/usr/bin/env node
/**
 * verify-prepaid-expenses-page-uses-paritytable — qbo-parity-a1 (PrepaidExpensesPage surface)
 *
 * Money-adjacent prepaid-asset list + amortization schedule (accounting/*, owner-greenlit UI-only
 * migration) must use the shared ParityTable grammar, not a hand-rolled <table>. DISPLAY-ONLY
 * migration: the list column set (# / Description / Purchase Date / Periods / Total / Amortized /
 * Remaining / Pending / Status / Actions), the SchedulePanel column set (# / Period Date / Amount /
 * Remaining / Posted / JE with the EntityLink journal-entry drill-through), the settled-only empty
 * text "No prepaid expenses found." (LIST-EMPTY-1), the URL-sort wiring (useUrlSort +
 * sortKey/sortDirection/onSortChange — BANK-SORT-ROLLOUT-ACCT), and the error surface on the list
 * query must all be preserved. No posting/GL logic lives in this file's tables; the create
 * mutation (CreateModal) must keep createPrepaidExpense AND send asset_account_id +
 * payment_account_id via ReferenceSelect createKind="account" (posting flag ON fails closed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-prepaid-expenses-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx";

const REQUIRED_LIST_LABELS = [
  "Description",
  "Purchase Date",
  "Periods",
  "Total",
  "Amortized",
  "Remaining",
  "Pending",
  "Status",
  "Actions",
];
const REQUIRED_SCHEDULE_LABELS = ["Period Date", "Amount", "Remaining", "Posted", "JE"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (list + SchedulePanel amortization schedule)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of [...REQUIRED_LIST_LABELS, ...REQUIRED_SCHEDULE_LABELS]) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="prepaid-expenses-list"')) {
    errors.push(`${PAGE}: must set storageKey="prepaid-expenses-list" on the list table`);
  }
  if (!src.includes('storageKey="prepaid-expense-schedule"')) {
    errors.push(`${PAGE}: must set storageKey="prepaid-expense-schedule" on the schedule table`);
  }
  if (!src.includes("No prepaid expenses found.")) {
    errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 guard literal)`);
  }
  if (!/\bloading=/.test(src)) {
    errors.push(`${PAGE}: list ParityTable must receive the loading prop (settled-only empty gate)`);
  }
  if (!src.includes("Failed to load prepaid expenses.")) {
    errors.push(`${PAGE}: must keep the list-query error surface`);
  }
  if (!/sortKey=\{sortKey\}/.test(src) || !/sortDirection=\{sortDirection\}/.test(src) || !/onSortChange=\{onSortChange\}/.test(src)) {
    errors.push(`${PAGE}: must keep the useUrlSort controlled-sort wiring (BANK-SORT-ROLLOUT-ACCT)`);
  }
  if (!src.includes('kind="journal_entry"') || !src.includes("posted_journal_entry_id")) {
    errors.push(`${PAGE}: schedule JE column must keep the EntityLink journal-entry drill-through`);
  }
  if (!src.includes("createPrepaidExpense")) {
    errors.push(`${PAGE}: CreateModal flow must remain (createPrepaidExpense missing)`);
  }
  if (!src.includes("ReferenceSelect")) {
    errors.push(`${PAGE}: CreateModal must use ReferenceSelect for prepaid/payment/expense GL`);
  }
  if ((src.match(/createKind="account"/g) ?? []).length < 3) {
    errors.push(`${PAGE}: CreateModal must have ≥3 ReferenceSelect createKind="account" (asset + payment + expense)`);
  }
  if (!src.includes("asset_account_id:") || !src.includes("payment_account_id:")) {
    errors.push(`${PAGE}: createPrepaidExpense payload must send asset_account_id and payment_account_id`);
  }
  if (src.includes("GL posting GATED — flag OFF")) {
    errors.push(`${PAGE}: CreateModal must not lie that posting is gated OFF while the API requires GLs`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { EntityLink } from "../../components/shared/EntityLink";
    import { useUrlSort } from "../../hooks/useUrlSort";
    import { createPrepaidExpense } from "../../api/prepaid-expenses";
    import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
    const SCHEDULE_COLUMNS = [
      { key: "period_number", label: "#", sortable: true },
      { key: "period_date", label: "Period Date", sortable: true },
      { key: "amount_cents", label: "Amount", sortable: true },
      { key: "remaining_balance_cents", label: "Remaining", sortable: true },
      { key: "posted", label: "Posted", sortable: true },
      { key: "posted_journal_entry_id", label: "JE", sortable: true, render: (row) => <EntityLink kind="journal_entry" id={row.posted_journal_entry_id} /> },
    ];
    const columns = [
      { key: "asset_number", label: "#", sortable: true },
      { key: "description", label: "Description", sortable: true },
      { key: "purchase_date", label: "Purchase Date", sortable: true },
      { key: "periods", label: "Periods", sortable: true },
      { key: "total_amount_cents", label: "Total", sortable: true },
      { key: "amortized_cents", label: "Amortized", sortable: true },
      { key: "remaining", label: "Remaining", sortable: true },
      { key: "pending_periods", label: "Pending", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "actions", label: "Actions" },
    ];
    {isError ? <p>Failed to load prepaid expenses.</p> : null}
    <ParityTable
      loading={isPending}
      storageKey="prepaid-expenses-list"
      emptyText="No prepaid expenses found."
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSortChange={onSortChange}
    />
    <ParityTable
      columns={SCHEDULE_COLUMNS}
      storageKey="prepaid-expense-schedule"
    />
    createPrepaidExpense({ asset_account_id: form.asset_account_id, payment_account_id: form.payment_account_id })
    <ReferenceSelect createKind="account" />
    <ReferenceSelect createKind="account" />
    <ReferenceSelect createKind="account" />
  `;
  const bad = `
    export function PrepaidExpensesPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Period Date</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable for list + schedule; columns/empty/error/URL-sort + JE drill-through preserved; display-only.`,
  );
}

main();
