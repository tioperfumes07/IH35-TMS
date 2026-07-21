#!/usr/bin/env node
/**
 * verify-qbo-sync-status-dashboard-uses-paritytable — qbo-parity-a1 (QBO sync status console)
 *
 * The sync-runs grid on the QBO Sync Status dashboard must use the shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. This is a READ-ONLY sync-run
 * status display — no journal entry, bill payment, or QBO write-back happens from the
 * table itself (TMS never writes to QBO). The pre-existing dead-letter Retry/Dismiss
 * inline buttons, the View entity drill-through, the status pill, and the
 * Payload/diagnostics expansion must be preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-sync-status-dashboard-uses-paritytable";
const PAGE = "apps/frontend/src/pages/qbo/QBOSyncStatusDashboardPage.tsx";

const REQUIRED_LABELS = ["Started", "Kind", "Status", "Retry#", "Last error", "Duration", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
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
  if (!src.includes('storageKey="qbo-sync-status-runs"')) {
    errors.push(`${PAGE}: must set storageKey="qbo-sync-status-runs"`);
  }
  if (!src.includes('tableTestId="qbo-sync-runs-table"')) {
    errors.push(`${PAGE}: must set tableTestId="qbo-sync-runs-table"`);
  }
  if (!src.includes("Retry now")) {
    errors.push(`${PAGE}: must keep the dead-letter "Retry now" inline action`);
  }
  if (!src.includes("Dismiss")) {
    errors.push(`${PAGE}: must keep the dead-letter "Dismiss" inline action`);
  }
  if (!src.includes("View entity")) {
    errors.push(`${PAGE}: must keep the "View entity" drill-through link`);
  }
  if (!src.includes("Payload / diagnostics")) {
    errors.push(`${PAGE}: must keep the "Payload / diagnostics" expanded-row detail`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const runColumns = [
      { key: "started_at", label: "Started" },
      { key: "kind", label: "Kind" },
      { key: "status", label: "Status" },
      { key: "retry_count", label: "Retry#" },
      { key: "last_error", label: "Last error" },
      { key: "duration_ms", label: "Duration" },
      { key: "actions", label: "Actions" },
    ];
    <ParityTable
      storageKey="qbo-sync-status-runs"
      tableTestId="qbo-sync-runs-table"
      renderExpanded={(r) => (
        <div>
          <div>Payload / diagnostics</div>
        </div>
      )}
    />
    <Button>Retry now</Button>
    <Button>Dismiss</Button>
    <Link>View entity</Link>
  `;
  const bad = `
    export function QBOSyncStatusDashboardPage() {
      return (
        <div>
          <table><thead><tr><th>Started</th></tr></thead></table>
        </div>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns, inline actions, drill-through, and diagnostics expansion preserved.`,
  );
}

main();
