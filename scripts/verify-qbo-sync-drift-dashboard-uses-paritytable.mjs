#!/usr/bin/env node
/**
 * verify-qbo-sync-drift-dashboard-uses-paritytable — qbo-parity-a1 (QBO sync drift dashboard)
 *
 * The drift-log grid on the QBO Sync Drift dashboard must use the shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. This is a READ-ONLY
 * clone-and-reconcile drift display — no journal entry, bill payment, or QBO write-back
 * happens from the table itself (TMS never writes to QBO). The pre-existing inline
 * resolve actions (accept_local / accept_qbo / manual_merge_recorded) must be preserved
 * 1:1 with unchanged handlers, along with the empty-state text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-sync-drift-dashboard-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/QBOSyncDriftDashboard.tsx";

const REQUIRED_LABELS = ["Entity", "Type", "Detected", "Status", "Actions"];

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
  if (!src.includes('storageKey="qbo-sync-drift-log"')) {
    errors.push(`${PAGE}: must set storageKey="qbo-sync-drift-log"`);
  }
  if (!src.includes('tableTestId="qbo-sync-drift-log-table"')) {
    errors.push(`${PAGE}: must set tableTestId="qbo-sync-drift-log-table"`);
  }
  for (const action of ["accept_local", "accept_qbo", "manual_merge_recorded"]) {
    if (!src.includes(`"${action}"`)) {
      errors.push(`${PAGE}: must keep the "${action}" inline resolve action`);
    }
  }
  if (!src.includes("resolveMutation.mutate")) {
    errors.push(`${PAGE}: inline resolve buttons must keep the resolveMutation.mutate handler`);
  }
  if (!src.includes("No drift entries logged yet.")) {
    errors.push(`${PAGE}: must keep the "No drift entries logged yet." empty state`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const driftColumns = [
      { key: "entity_type", label: "Entity" },
      { key: "drift_type", label: "Type" },
      { key: "detected_at", label: "Detected" },
      { key: "status", label: "Status" },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <div>
            {(["accept_local", "accept_qbo", "manual_merge_recorded"]).map((action) => (
              <button onClick={() => resolveMutation.mutate({ id: row.id, action })}>{action}</button>
            ))}
          </div>
        ),
      },
    ];
    <ParityTable
      emptyText="No drift entries logged yet."
      storageKey="qbo-sync-drift-log"
      tableTestId="qbo-sync-drift-log-table"
    />
  `;
  const bad = `
    export function QBOSyncDriftDashboard() {
      return (
        <div>
          <table><thead><tr><th>Entity</th></tr></thead></table>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable; columns, inline resolve actions, and empty state preserved.`,
  );
}

main();
