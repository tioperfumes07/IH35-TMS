#!/usr/bin/env node
/**
 * verify-transaction-register-page-uses-paritytable — TransactionRegisterPage surface
 *
 * The All Transactions register (bank / fuel / invoice / bill / settlement) must use the
 * shared ParityTable grammar, not a hand-rolled <table>. Display-only migration on a
 * money-adjacent ledger view: the 9-column order (Source, Date, Description, Type,
 * Customer / Vendor, In, Out, Status, Link), the formatCurrencyFromCents amount cells,
 * the In/Out page totals, the ListErrorState error surface, and the server-side pager
 * must all be preserved. Read-only register — no mutations allowed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-transaction-register-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx";

const REQUIRED_LABELS = [
  "Source",
  "Date",
  "Description",
  "Type",
  "Customer / Vendor",
  "In",
  "Out",
  "Status",
  "Link",
];

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
  if (!src.includes('storageKey="transaction-register"')) {
    errors.push(`${PAGE}: must set storageKey="transaction-register"`);
  }
  if (!src.includes('tableTestId="transaction-register-table"')) {
    errors.push(`${PAGE}: must set tableTestId="transaction-register-table"`);
  }
  if (!src.includes("formatCurrencyFromCents")) {
    errors.push(`${PAGE}: must keep formatCurrencyFromCents for In/Out amount cells (display-only law)`);
  }
  if (!src.includes("In (page):") || !src.includes("Out (page):")) {
    errors.push(`${PAGE}: must keep the In/Out page totals line`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState error surface on query error`);
  }
  if (!src.includes("No transactions for the selected filters.")) {
    errors.push(`${PAGE}: must keep the empty-state text`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only register — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { useMemo } from "react";
    import { ListErrorState } from "../../components/ListErrorState";
    import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "source", label: "Source" },
      { key: "date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "type", label: "Type" },
      { key: "counterparty", label: "Customer / Vendor" },
      { key: "amount_in_cents", label: "In", render: (r) => formatCurrencyFromCents(r.amount_in_cents) },
      { key: "amount_out_cents", label: "Out", render: (r) => formatCurrencyFromCents(r.amount_out_cents) },
      { key: "status", label: "Status" },
      { key: "link", label: "Link" },
    ];
    <span>In (page): x</span>
    <span>Out (page): y</span>
    <ListErrorState onRetry={() => {}} />
    <ParityTable
      storageKey="transaction-register"
      tableTestId="transaction-register-table"
      emptyText="No transactions for the selected filters."
    />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function TransactionRegisterPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Source</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; 9-column order, amount formatting, totals, and error surface preserved; read-only.`,
  );
}

main();
