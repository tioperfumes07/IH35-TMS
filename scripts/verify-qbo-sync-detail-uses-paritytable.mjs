#!/usr/bin/env node
/**
 * verify-qbo-sync-detail-uses-paritytable — qbo-parity-a1 (QboSyncDetailPage surface)
 *
 * Read-only QBO sync event log must use the shared ParityTable grammar (sort/resize/gear +
 * renderExpanded JSON detail), not a hand-rolled <table>. Display-only migration: the
 * ReportBlockVPendingBanner error surface, kind/severity pill filters, and the settled-only
 * empty text (LIST-EMPTY-1) must all be preserved. TMS never writes to QBO — this page has
 * no mutations and must stay that way (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-sync-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/qbo-sync-detail/QboSyncDetailPage.tsx";

const REQUIRED_LABELS = ["Timestamp", "Kind", "Severity", "Summary"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  if (src.includes("dataTableErrorState")) {
    errors.push(`${PAGE}: must not use dataTableErrorState`);
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
  if (!src.includes('storageKey="qbo-sync-event-log"')) {
    errors.push(`${PAGE}: must set storageKey="qbo-sync-event-log"`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for the event detail JSON`);
  }
  if (!src.includes("No QBO sync events match the selected filters.")) {
    errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1 guard literal)`);
  }
  if (!src.includes("ReportBlockVPendingBanner")) {
    errors.push(`${PAGE}: must keep ReportBlockVPendingBanner error surface on query error`);
  }
  if (!src.includes('tableTestId="qbo-sync-event-log-table"')) {
    errors.push(`${PAGE}: must set tableTestId="qbo-sync-event-log-table"`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only surface — must not add mutations (TMS never writes to QBO)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ReportBlockVPendingBanner } from "../reports/ReportBlockVPendingBanner";
    const COLUMNS = [
      { key: "occurred_at", label: "Timestamp" },
      { key: "kind", label: "Kind" },
      { key: "severity", label: "Severity" },
      { key: "summary", label: "Summary" },
    ];
    <ReportBlockVPendingBanner error={q.error} onRetry={() => {}} />
    <ParityTable
      storageKey="qbo-sync-event-log"
      tableTestId="qbo-sync-event-log-table"
      emptyText={listState.isEmpty ? "No QBO sync events match the selected filters." : undefined}
      renderExpanded={(row) => <pre>{JSON.stringify(row.detail)}</pre>}
    />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function QboSyncDetailPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Timestamp</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/filters/error surface preserved; read-only.`);
}

main();
