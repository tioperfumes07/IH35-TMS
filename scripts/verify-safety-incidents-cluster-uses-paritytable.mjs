#!/usr/bin/env node
/**
 * verify-safety-incidents-cluster-uses-paritytable — qbo-parity-a1 (SafetyIncidentsClusterSurface)
 *
 * Shared damage-reports / trailer-interchange incidents list must use ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. List outages must surface ListErrorState
 * (never false-empty "No records found." on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-incidents-cluster-uses-paritytable";
const PAGE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";

const REQUIRED_LABELS = ["Date", "Driver", "Unit", "Location", "Status", "Action"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
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
  if (!src.includes('emptyText="No records found."')) {
    errors.push(`${PAGE}: must keep emptyText="No records found."`);
  }
  if (!src.includes("Couldn't load incidents")) {
    errors.push(`${PAGE}: must keep ListErrorState title for incidents outage`);
  }
  if (!/useListState\s*\(\s*listQuery/.test(src)) {
    errors.push(`${PAGE}: must keep useListState(listQuery, …) for settled empty invariant`);
  }
  if (!src.includes("tableTestId={`${config.pageTestId}-table`}")) {
    errors.push(`${PAGE}: must keep tableTestId=\`\${config.pageTestId}-table\``);
  }
  if (!src.includes("rowTestId={(row) => `${config.pageTestId}-row-${String(row.id)}`}")) {
    errors.push(`${PAGE}: must keep rowTestId hook for per-row testids`);
  }
  if (!src.includes("storageKey={`safety-incidents-cluster-${config.incidentType}`}")) {
    errors.push(`${PAGE}: must set storageKey per incident type`);
  }
  if (!src.includes("safety-incidents-from-date")) {
    errors.push(`${PAGE}: must keep safety-incidents-from-date filter testid`);
  }
  if (!src.includes("safety-incidents-to-date")) {
    errors.push(`${PAGE}: must keep safety-incidents-to-date filter testid`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const listState = useListState(listQuery, rows.length === 0);
    {listQuery.isError ? (
      <ListErrorState title="Couldn't load incidents" status={0} onRetry={() => {}} />
    ) : (
      <ParityTable
        storageKey={\`safety-incidents-cluster-\${config.incidentType}\`}
        tableTestId={\`\${config.pageTestId}-table\`}
        rowTestId={(row) => \`\${config.pageTestId}-row-\${String(row.id)}\`}
        emptyText="No records found."
        columns={[
          { key: "incident_at", label: "Date" },
          { key: "driver_id", label: "Driver" },
          { key: "unit_id", label: "Unit" },
          { key: "location", label: "Location" },
          { key: "status", label: "Status" },
          { key: "action", label: "Action" },
        ]}
      />
    )}
    data-testid="safety-incidents-from-date"
    data-testid="safety-incidents-to-date"
  `;
  const bad = `
    export function SafetyIncidentsClusterSurface() {
      return (
        <table data-testid="damage-reports-page-table"><thead><tr><th>Date</th></tr></thead></table>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + filter testids preserved.`
  );
}

main();
