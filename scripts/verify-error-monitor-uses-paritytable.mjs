#!/usr/bin/env node
/**
 * verify-error-monitor-uses-paritytable — qbo-parity-a1 (ErrorMonitorPage surface)
 *
 * Admin error monitor must use shared ParityTable grammar (sort/resize/gear +
 * renderExpanded detail JSON), not a hand-rolled <table>. Outages must surface
 * ListErrorState (never a bare red banner or false-empty buffered list).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-error-monitor-uses-paritytable";
const PAGE = "apps/frontend/src/pages/admin/ErrorMonitor.tsx";

const REQUIRED_LABELS = ["Time", "Kind", "Message", "Detail"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
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
  if (!src.includes('storageKey="admin-error-monitor"')) {
    errors.push(`${PAGE}: must set storageKey="admin-error-monitor"`);
  }
  if (!src.includes('tableTestId="admin-error-monitor-table"')) {
    errors.push(`${PAGE}: must set tableTestId="admin-error-monitor-table"`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for detail JSON`);
  }
  if (!src.includes("No buffered errors yet (this resets on process restart).")) {
    errors.push(`${PAGE}: must keep emptyText for empty buffered list`);
  }
  if (!src.includes("Couldn't load error monitor")) {
    errors.push(`${PAGE}: must keep ListErrorState title for error-monitor outage`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "ts", label: "Time" },
      { key: "kind", label: "Kind" },
      { key: "message", label: "Message" },
      { key: "detail", label: "Detail" },
    ];
    <ListErrorState title="Couldn't load error monitor" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="admin-error-monitor"
      tableTestId="admin-error-monitor-table"
      emptyText="No buffered errors yet (this resets on process restart)."
      renderExpanded={(row) => <pre>{JSON.stringify(row.detail)}</pre>}
    />
  `;
  const bad = `
    export function ErrorMonitorPage() {
      return (
        <div>
          <p className="text-sm text-red-700">Failed to load errors</p>
          <table><thead><tr><th>Time</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + admin-error-monitor testid preserved.`);
}

main();
