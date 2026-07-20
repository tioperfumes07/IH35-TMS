#!/usr/bin/env node
/**
 * verify-portal-dashboard-uses-paritytable — qbo-parity-a1 (PortalDashboardPage surface)
 *
 * Shipper portal "Your loads" grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Query failures must surface ListErrorState (never a bare red
 * line). Columns Load # / Route / Status / Progress preserved; load detail links and
 * progress StatusBadge preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-portal-dashboard-uses-paritytable";
const PAGE = "apps/frontend/src/portal/PortalDashboardPage.tsx";

const REQUIRED_LABELS = ["Load #", "Route", "Status", "Progress"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../components/parity/ParityTable"') &&
    !src.includes("from '../components/parity/ParityTable'")
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
  if (!src.includes('storageKey="portal-dashboard-loads"')) {
    errors.push(`${PAGE}: must set storageKey="portal-dashboard-loads"`);
  }
  if (!src.includes('tableTestId="portal-dashboard-loads-table"')) {
    errors.push(`${PAGE}: must set tableTestId="portal-dashboard-loads-table"`);
  }
  if (!src.includes("Couldn't load shipments")) {
    errors.push(`${PAGE}: must keep ListErrorState title for portal loads outage`);
  }
  if (!src.includes("No loads to display yet.")) {
    errors.push(`${PAGE}: must keep emptyText for empty portal loads list`);
  }
  if (!src.includes("/portal/loads/")) {
    errors.push(`${PAGE}: must keep load detail links under /portal/loads/`);
  }
  if (!src.includes("StatusBadge")) {
    errors.push(`${PAGE}: must keep StatusBadge for progress column`);
  }
  if (!src.includes("Your loads")) {
    errors.push(`${PAGE}: must keep page heading Your loads`);
  }
  if (!src.includes("refetchInterval: 30_000")) {
    errors.push(`${PAGE}: must keep 30s auto-refresh interval`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../components/ListErrorState";
    import { StatusBadge } from "../components/layout/StatusBadge";
    import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
    const COLUMNS = [
      { key: "load_number", label: "Load #" },
      { key: "route", label: "Route" },
      { key: "status", label: "Status" },
      { key: "progress_status", label: "Progress" },
    ];
    <h1>Your loads</h1>
    <ListErrorState title="Couldn't load shipments" status={0} onRetry={() => {}} />
    <Link to={\`/portal/loads/\${load.id}\`} />
    <StatusBadge variant="neutral" />
    refetchInterval: 30_000,
    <ParityTable
      storageKey="portal-dashboard-loads"
      tableTestId="portal-dashboard-loads-table"
      emptyText="No loads to display yet."
    />
  `;
  const bad = `
    export function PortalDashboardPage() {
      return (
        <div>
          <p className="text-red-600">Could not load shipments.</p>
          <table><thead><tr><th>Load #</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
