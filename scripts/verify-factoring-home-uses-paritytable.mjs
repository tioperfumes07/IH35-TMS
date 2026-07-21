#!/usr/bin/env node
/**
 * verify-factoring-home-uses-paritytable — FactoringHome.tsx ParityTable migration guard.
 *
 * Financial surface (factoring = secured borrowing / Faro terms) — this was a DISPLAY-ONLY
 * migration: the four hand-rolled read-only tables (monthly fee summaries, statement history,
 * recent Faro imports, recent merge history) moved onto the shared ParityTable grammar with
 * ListErrorState on query error. Column order/labels and the fmtCurrency/fmtDate cell
 * formatting are preserved 1:1. Zero hand-rolled <table>/<thead> may remain in this file.
 * The write surfaces on the page (Faro upsert, equipment-loan create/attribution/payment,
 * vendor merge) are untouched action handlers — NOT tables — and stay as-is.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-home-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

const REQUIRED_LABELS = [
  // Monthly fee summaries + Statement history (shared labels)
  "Month",
  "Chargebacks",
  "Fees",
  // Recent Faro imports
  "Statement Date",
  "Reference",
  "Gross",
  "Advance",
  "Reserve",
  "Fee",
  // Recent merge history
  "Driver",
  "From",
  "To",
  "Reason",
  "Merged At",
];

const REQUIRED_STORAGE_KEYS = [
  "factoring-home-monthly-fee-summaries",
  "factoring-home-statement-history",
  "factoring-home-faro-imports",
  "factoring-home-vendor-merges",
];

const REQUIRED_EMPTY_TEXTS = [
  "No monthly fee summaries available.",
  "No statement history rows available.",
  "No Faro imports recorded yet.",
  "No merge history yet.",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import and render ParityTable from components/parity/ParityTable`);
  }
  const parityCount = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityCount < 4) {
    errors.push(`${PAGE}: expected ≥4 <ParityTable> (one per migrated read-only table), found ${parityCount}`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}" (column set must be preserved 1:1)`);
    }
  }
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(`storageKey="${key}"`)) {
      errors.push(`${PAGE}: must set distinct storageKey="${key}"`);
    }
  }
  for (const text of REQUIRED_EMPTY_TEXTS) {
    if (!src.includes(text)) {
      errors.push(`${PAGE}: must keep the exact empty-state text: "${text}"`);
    }
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error for the migrated tables`);
  }
  if (!src.includes("formatQueryErrorDetail")) {
    errors.push(`${PAGE}: must use formatQueryErrorDetail for the ListErrorState detail`);
  }
  // Display-only invariant: preserved money formatting through the page's fmtCurrency helper.
  if (!src.includes("fmtCurrency")) {
    errors.push(`${PAGE}: must keep fmtCurrency-based amount rendering (display formatting preserved 1:1)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { formatQueryErrorDetail } from "../../lib/tableError";
    const MONTHLY_FEE_COLUMNS = [
      { key: "statement_month", label: "Month", render: (row) => fmtDate(row.statement_month) },
      { key: "chargeback_total", label: "Chargebacks", render: (row) => fmtCurrency(row.chargeback_total) },
      { key: "factor_fee_total", label: "Fees" },
    ];
    const FARO = [
      { key: "statement_date", label: "Statement Date" },
      { key: "statement_reference", label: "Reference" },
      { key: "gross_total_cents", label: "Gross", render: (row) => fmtCurrency(Number(row.gross_total_cents ?? 0) / 100) },
      { key: "advance_total_cents", label: "Advance" },
      { key: "reserve_total_cents", label: "Reserve" },
      { key: "fee_total_cents", label: "Fee" },
    ];
    const MERGES = [
      { key: "driver_id", label: "Driver" },
      { key: "from_qbo_vendor_id", label: "From" },
      { key: "to_qbo_vendor_id", label: "To" },
      { key: "merge_reason", label: "Reason" },
      { key: "merged_at", label: "Merged At" },
    ];
    <ListErrorState {...formatQueryErrorDetail(q.error)} onRetry={() => {}} />
    <ParityTable storageKey="factoring-home-monthly-fee-summaries" emptyText="No monthly fee summaries available." />
    <ParityTable storageKey="factoring-home-statement-history" emptyText="No statement history rows available." />
    <ParityTable storageKey="factoring-home-faro-imports" emptyText="No Faro imports recorded yet." />
    <ParityTable storageKey="factoring-home-vendor-merges" emptyText="No merge history yet." />
  `;
  const bad = `
    export function FactoringHomePage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Month</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} — 4 read-only tables on ParityTable; columns/formatting/empty texts preserved; ListErrorState wired.`
  );
}

main();
