#!/usr/bin/env node
/**
 * verify-customers-uses-paritytable — Customers master-detail transaction list
 *
 * Customers.tsx already renders its transaction list via shared ParityTable
 * (sort/resize/gear/CSV export) — the hand-rolled `<table>` was removed in an
 * earlier sweep, but the inventory row was never flipped and no guard pinned
 * the page. This guard locks the ParityTable contract so a regression cannot
 * reintroduce a hand-rolled grid. Columns Date / Type / Doc # / Status /
 * Amount / Balance / Load # (+ defaultHidden Settlement # / Truck # /
 * Pick-up date / Delivery date / Loaded miles), the empty state, CSV export,
 * and "+ Create Customer" action are preserved 1:1. Tab count unchanged —
 * internals-only pin (no schema / posting / module changes).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-uses-paritytable";
const PAGE = "apps/frontend/src/pages/Customers.tsx";

// Transaction-list column order is part of the preserved contract — assert order, not just presence.
const TX_LABELS_IN_ORDER = [
  "Date",
  "Type",
  "Doc #",
  "Status",
  "Amount",
  "Balance",
  "Load #",
  "Settlement #",
  "Truck #",
  "Pick-up date",
  "Delivery date",
  "Loaded miles",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../components/parity/ParityTable"') &&
    !src.includes("from '../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <thead>`);
  }
  // Forward-scan so shared labels elsewhere on the page don't false-positive:
  // each tx-list label must appear AFTER the previous one, in the locked order.
  let cursor = 0;
  for (const label of TX_LABELS_IN_ORDER) {
    const idx = src.indexOf(`label: "${label}"`, cursor);
    if (idx === -1) {
      errors.push(`${PAGE}: missing (or out-of-order) transaction-list column label: "${label}"`);
      continue;
    }
    cursor = idx + 1;
  }
  if (!src.includes('storageKey="customer-transactions"')) {
    errors.push(`${PAGE}: must set storageKey="customer-transactions"`);
  }
  if (!src.includes('exportFilename="customer-transactions"')) {
    errors.push(`${PAGE}: must enable customer-transactions CSV export`);
  }
  if (!src.includes('emptyText="No transactions for current filters."')) {
    errors.push(`${PAGE}: must keep the "No transactions for current filters." empty state`);
  }
  if (!/\+\s*Create Customer/.test(src)) {
    errors.push(`${PAGE}: must keep the "+ Create Customer" action (§7 canonical verb)`);
  }
  if (/\+\s*(Add|New) Customer/.test(src)) {
    errors.push(`${PAGE}: create action uses "+ Add/New Customer" — §7 requires "+ Create"`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
    <ActionButton>+ Create Customer</ActionButton>
    <ParityTable
      emptyText="No transactions for current filters."
      storageKey="customer-transactions"
      exportFilename="customer-transactions"
      columns={[
        { key: "date", label: "Date" },
        { key: "type", label: "Type" },
        { key: "doc_no", label: "Doc #" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount" },
        { key: "balance", label: "Balance" },
        { key: "load_no", label: "Load #" },
        { key: "settlement_no", label: "Settlement #" },
        { key: "truck_no", label: "Truck #" },
        { key: "pickup_date", label: "Pick-up date" },
        { key: "delivery_date", label: "Delivery date" },
        { key: "loaded_miles", label: "Loaded miles" },
      ]}
    />
  `;
  const bad = `
    export function CustomersPage() {
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
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable; transaction columns/empty state/CSV/+ Create Customer preserved; no hand-rolled <table>.`,
  );
}

main();
