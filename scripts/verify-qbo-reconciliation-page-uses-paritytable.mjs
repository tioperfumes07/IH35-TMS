#!/usr/bin/env node
/**
 * verify-qbo-reconciliation-page-uses-paritytable — qbo-parity (QboReconciliationPage surface)
 *
 * The daily TMS ↔ QBO reconciliation screen (object counts + AR/AP balance reconciliation +
 * findings drill-down) must use the shared ParityTable grammar, not hand-rolled <table>s.
 * Display-only migration: column order/labels, fmtCents/fmtNum amount formatting, the SyncPill
 * status chips, the per-object Findings toggle button, and both settled empty texts must all be
 * preserved. QBO is reconcile-only — this page is read-only and must stay that way (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-reconciliation-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/QboReconciliationPage.tsx";

const REQUIRED_LABELS = [
  // Object counts table (order-preserved 1:1 from the former hand-rolled header row)
  "Object",
  "TMS",
  "QBO (mirror)",
  "QBO (remote API)",
  "Δ vs ",
  "Status",
  // Balance reconciliation table
  "Balance",
  "Δ",
  // Findings table
  "Type",
  "Category",
  "Severity",
  "Drift",
  "Detected",
  "Last seen",
];

const REQUIRED_STORAGE_KEYS = ["qbo-recon-object-counts", "qbo-recon-balances", "qbo-recon-findings"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 3) {
    errors.push(`${PAGE}: expected ≥3 <ParityTable> (object counts + balances + findings)`);
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
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(`storageKey="${key}"`)) {
      errors.push(`${PAGE}: must set storageKey="${key}"`);
    }
  }
  if (!src.includes("No reconciliation data available.")) {
    errors.push(`${PAGE}: must keep the object-counts empty text`);
  }
  if (!src.includes("No reconciliation findings recorded. A reconciliation run populates this list.")) {
    errors.push(`${PAGE}: must keep the findings empty text`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("SyncPill")) {
    errors.push(`${PAGE}: must keep the SyncPill in-sync/drift status chips`);
  }
  if (!src.includes("fmtCents") || !src.includes("formatUsdCents")) {
    errors.push(`${PAGE}: must keep formatUsdCents-based cents formatting for balance amounts`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only surface — must not add mutations (TMS never writes to QBO)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    import { formatUsdCents } from "../../lib/money";
    const fmtCents = (c) => formatUsdCents(c);
    function SyncPill() { return null; }
    const objectColumns = [
      { key: "label", label: "Object" },
      { key: "tms_count", label: "TMS" },
      { key: "qbo_mirror_count", label: "QBO (mirror)" },
      { key: "qbo_remote_count", label: "QBO (remote API)" },
      { key: "count_delta", label: "Δ vs " },
      { key: "count_in_sync", label: "Status" },
    ];
    const balanceColumns = [
      { key: "balance_label", label: "Balance" },
      { key: "balance_delta_cents", label: "Δ" },
    ];
    const findingColumns = [
      { key: "finding_type", label: "Type" },
      { key: "mirror_category", label: "Category" },
      { key: "severity", label: "Severity" },
      { key: "drift_metric_abs", label: "Drift" },
      { key: "detected_at", label: "Detected" },
      { key: "last_seen_at", label: "Last seen" },
    ];
    <ListErrorState title="Failed to load reconciliation." status={0} onRetry={() => {}} />
    <ParityTable storageKey="qbo-recon-object-counts" emptyText="No reconciliation data available." />
    <ParityTable storageKey="qbo-recon-balances" />
    <div>{"No reconciliation findings recorded. A reconciliation run populates this list."}</div>
    <ParityTable storageKey="qbo-recon-findings" />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function QboReconciliationPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Object</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable ×3; columns/formatting/empty texts preserved; read-only.`);
}

main();
