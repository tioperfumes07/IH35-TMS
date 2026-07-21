#!/usr/bin/env node
/**
 * verify-arap-aging-page-uses-paritytable — qbo-parity-a1 (ArApAgingPage surface)
 *
 * FIN-20 AR/AP aging report (read-only, feature-flag gated) must use the shared ParityTable
 * grammar for all three of its former hand-rolled <table>s: the A/R-by-customer main grid,
 * the A/P-by-vendor main grid, and the per-row open-invoices / open-bills drill panels
 * (renderExpanded). Display-only migration: cents formatting via fmtCents, bucket column
 * order (Current / 1–30 / 31–60 / 61–90 / 91+ / Total open), the Grand total row values,
 * the page-level Export CSV + Print actions, and the AR_AP_AGING_UI_ENABLED gate must all
 * be preserved. This is a report surface — it must never post or mutate (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-arap-aging-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/finance/ArApAgingPage.tsx";

const REQUIRED_LABELS = [
  "Customer",
  "Vendor",
  "Current",
  "1–30",
  "31–60",
  "61–90",
  "91+",
  "Total open",
  "Invoice",
  "Bill #",
  "Days past due",
];

const REQUIRED_STORAGE_KEYS = [
  "ar-aging-by-customer",
  "ap-aging-by-vendor",
  "ar-aging-invoices-drill",
  "ap-aging-bills-drill",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 4) {
    errors.push(`${PAGE}: expected ≥4 <ParityTable> (AR main, AP main, AR drill, AP drill)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src) || /<tfoot[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>/<tfoot>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(`storageKey="${key}"`)) {
      errors.push(`${PAGE}: must set storageKey="${key}"`);
    }
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for the invoices/bills drill panels`);
  }
  if (!src.includes("Grand total")) {
    errors.push(`${PAGE}: must keep the Grand total row (bucket totals preserved 1:1)`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("AR_AP_AGING_UI_FLAG")) {
    errors.push(`${PAGE}: must keep the AR_AP_AGING_UI_ENABLED feature-flag gate`);
  }
  if (!src.includes("Export CSV")) {
    errors.push(`${PAGE}: must keep the page-level Export CSV action`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only report — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    import { AR_AP_AGING_UI_FLAG } from "../../api/arApAging";
    const BUCKET_COLS = [
      { key: "current_cents", label: "Current" },
      { key: "bucket_1_30_cents", label: "1–30" },
      { key: "bucket_31_60_cents", label: "31–60" },
      { key: "bucket_61_90_cents", label: "61–90" },
      { key: "bucket_91_plus_cents", label: "91+" },
      { key: "total_open_cents", label: "Total open" },
    ];
    const AR_COLUMNS = [{ key: "customer_name", label: "Customer" }];
    const AP_COLUMNS = [{ key: "vendor_name", label: "Vendor" }];
    const AR_DRILL_COLUMNS = [{ key: "display_id", label: "Invoice" }, { key: "days_overdue", label: "Days past due" }];
    const AP_DRILL_COLUMNS = [{ key: "bill_number", label: "Bill #" }];
    <button>Export CSV</button>
    <ListErrorState title="Couldn't load aging" status={0} onRetry={() => {}} />
    <ParityTable storageKey="ar-aging-by-customer" renderExpanded={(r) => <div />} />
    <ParityTable storageKey="ap-aging-by-vendor" renderExpanded={(r) => <div />} />
    <ParityTable storageKey="ar-aging-invoices-drill" />
    <ParityTable storageKey="ap-aging-bills-drill" />
    <span>Grand total</span>
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function ArApAgingPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Customer</th></tr></thead>
          <tfoot><tr><td>Grand total</td></tr></tfoot>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable for all aging grids; buckets/totals/flag gate preserved; read-only.`);
}

main();
