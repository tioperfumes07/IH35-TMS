#!/usr/bin/env node
/**
 * verify-bills-page-uses-paritytable — A/P Bills list surface (financial, display-only).
 *
 * BillsPage is a READ-ONLY vendor-bills list (the write paths live in CreateBillModal /
 * CreateMultipleBillsPage / bulk mark_scheduled — none migrated or changed here). The main
 * grid already renders via ParityTable; this guard pins that the per-row expanded
 * payments sub-table also uses the shared ParityTable grammar (no hand-rolled <table>),
 * and that the display-only contract holds: exact column order (Vendor, Bill #, Date,
 * Original, Paid, Balance, Status, Reconciled, Due date, Claim, Work order, Memo, Allocate), cents-based
 * money() formatting, the ListErrorBanner error surface, the inline Allocate action
 * (handler unchanged), and the "No bills found." empty text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bills-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/BillsPage.tsx";

// Main grid column order is part of the display-only contract — assert order, not just presence.
const MAIN_LABELS_IN_ORDER = [
  "Vendor",
  "Bill #",
  "Date",
  "Original",
  "Paid",
  "Balance",
  "Status",
  "Reconciled",
  "Due date",
  "Claim",
  "Work order",
  "Memo",
  "Allocate",
];

const SUBTABLE_LABELS = ["Payment date", "Amount", "Bank account"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (bills grid + payments sub-table)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  // Forward-scan so labels the payments sub-table shares (e.g. "Memo") don't false-positive:
  // each main-grid label must appear AFTER the previous one, in the locked order.
  let cursor = 0;
  for (const label of MAIN_LABELS_IN_ORDER) {
    const idx = src.indexOf(`label: "${label}"`, cursor);
    if (idx === -1) {
      errors.push(`${PAGE}: missing (or out-of-order) main-grid column label: "${label}"`);
      continue;
    }
    cursor = idx + 1;
  }
  for (const label of SUBTABLE_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing payments sub-table column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="bills-list"')) {
    errors.push(`${PAGE}: must set storageKey="bills-list" on the bills grid`);
  }
  if (!src.includes('storageKey="bill-payments-subtable"')) {
    errors.push(`${PAGE}: must set storageKey="bill-payments-subtable" on the payments sub-table`);
  }
  if (!/currency:\s*"USD"/.test(src) || !src.includes("/ 100")) {
    errors.push(`${PAGE}: must keep the cents-based USD money() formatter`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep the ListErrorBanner error surface on query error`);
  }
  if (!src.includes("Allocate")) {
    errors.push(`${PAGE}: must keep the inline Allocate action column`);
  }
  if (!src.includes("setAllocationBillId")) {
    errors.push(`${PAGE}: Allocate action handler (setAllocationBillId) must be preserved`);
  }
  if (!src.includes('emptyText="No bills found."')) {
    errors.push(`${PAGE}: must keep the empty text "No bills found."`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    function money(cents) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
    }
    const subColumns = [
      { key: "payment_date", label: "Payment date" },
      { key: "amount_cents", label: "Amount" },
      { key: "from_bank_account_id", label: "Bank account" },
      { key: "memo", label: "Memo" },
    ];
    const columns = [
      { key: "vendor_name", label: "Vendor" },
      { key: "bill_number", label: "Bill #" },
      { key: "bill_date", label: "Date" },
      { key: "amount_cents", label: "Original" },
      { key: "paid_cents", label: "Paid" },
      { key: "balance", label: "Balance" },
      { key: "status", label: "Status" },
      { key: "is_reconciled", label: "Reconciled" },
      { key: "due_date", label: "Due date" },
      { key: "insurance_claim_id", label: "Claim" },
      { key: "linked_work_order_uuid", label: "Work order" },
      { key: "memo", label: "Memo" },
      { key: "allocate", label: "Allocate", render: (bill) => <button onClick={() => setAllocationBillId(bill.id)}>Allocate</button> },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable columns={subColumns} storageKey="bill-payments-subtable" />
    <ParityTable columns={columns} storageKey="bills-list" emptyText="No bills found." />
  `;
  const bad = `
    export function BillsPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Vendor</th></tr></thead>
        </table>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  const missingClaimWo = assertMigrated(good.replace('label: "Claim"', 'label: "Xclaim"').replace('label: "Work order"', 'label: "Xwo"'));
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (!missingClaimWo.some((e) => e.includes("Claim") || e.includes("Work order"))) {
    console.error(`${LABEL} --selftest FAIL must redden when Claim/Work order columns are gone:`, missingClaimWo);
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
    `OK ${LABEL}: ${PAGE} uses ParityTable for grid + payments sub-table; column order/money/error surface/Allocate action preserved; display-only.`,
  );
}

main();
