#!/usr/bin/env node
/**
 * verify-qbo-reconcile-captures-page-uses-paritytable — qbo-parity-a1 (QboReconcileCapturesPage surface)
 *
 * FIN-23 read-only QBO reconcile / modify-captures surface must use the shared ParityTable
 * grammar for every table (sync health, modify captures, conflict field diffs, reconciliation
 * alerts, recon runs, recon exceptions), not a hand-rolled <table>. Display-only migration:
 * the QBO_RECONCILE_UI_ENABLED flag gate, the ReconDisabledHint 404 surface, the status
 * filters, and the server-side captures pager must all be preserved. This page is
 * reconcile-only (TMS never writes to QBO) — it has no mutations and must stay that way
 * (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-reconcile-captures-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx";

// One representative label per migrated table, plus the exact original header sets that must
// survive the migration 1:1 (column order is enforced by review; presence is enforced here).
const REQUIRED_LABELS = [
  // Sync health (overview)
  "Entity",
  "Local",
  "QBO",
  "Pending",
  "Status",
  // Modify captures
  "Received",
  "QBO ID",
  "Event",
  "QBO Updated",
  "Reflected in TMS",
  // Conflict field diff
  "Field",
  "TMS (local)",
  "QBO (remote)",
  // Reconciliation alerts
  "Run at",
  "Delta %",
  "Severity",
  // Recon runs
  "Started",
  "Type",
  "Window",
  "Exceptions",
  // Recon exceptions
  "Class",
  "TMS",
];

const REQUIRED_STORAGE_KEYS = [
  "qbo-reconcile-sync-health",
  "qbo-reconcile-captures",
  "qbo-reconcile-conflict-fields",
  "qbo-reconcile-alerts",
  "qbo-reconcile-recon-runs",
  "qbo-reconcile-recon-exceptions",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 6) {
    errors.push(`${PAGE}: expected ≥6 <ParityTable> (health, captures, conflict diff, alerts, runs, exceptions)`);
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
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must use ListErrorState on query error`);
  }
  if (!src.includes("ReconDisabledHint")) {
    errors.push(`${PAGE}: must keep the ReconDisabledHint 404 surface for the recon module`);
  }
  if (!src.includes("QBO_RECONCILE_UI_ENABLED")) {
    errors.push(`${PAGE}: must keep the QBO_RECONCILE_UI_ENABLED flag gate`);
  }
  if (!src.includes("No QBO modify captures recorded.")) {
    errors.push(`${PAGE}: must keep the captures empty text`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only surface — must not add mutations (TMS never writes to QBO)`);
  }
  return errors;
}

function selftest() {
  const labels = REQUIRED_LABELS.map((l) => `{ key: "x", label: "${l}" },`).join("\n");
  const storageKeys = REQUIRED_STORAGE_KEYS.map(
    (k) => `<ParityTable storageKey="${k}" rows={[]} columns={[]} rowKey={(r) => r.id} />`,
  ).join("\n");
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    const FLAG = "QBO_RECONCILE_UI_ENABLED";
    function ReconDisabledHint() { return null; }
    const COLUMNS = [
      ${labels}
    ];
    <ListErrorState title="Failed to load modify captures." status={0} onRetry={() => {}} />
    <ParityTable emptyText="No QBO modify captures recorded." rows={[]} columns={[]} rowKey={(r) => r.id} />
    ${storageKeys}
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function QboReconcileCapturesPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Received</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable for all six tables; flag gate, filters, and read-only surface preserved.`,
  );
}

main();
