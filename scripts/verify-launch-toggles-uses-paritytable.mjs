#!/usr/bin/env node
/**
 * verify-launch-toggles-uses-paritytable — qbo-parity-a1 (LaunchTogglesPage surface)
 *
 * Admin launch-toggles carrier grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never false-empty on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-launch-toggles-uses-paritytable";
const PAGE = "apps/frontend/src/pages/admin/LaunchToggles.tsx";

const REQUIRED_LABELS = ["Carrier", "Status", "Last action", "Actions"];

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
  if (!src.includes('storageKey="admin-launch-toggles"')) {
    errors.push(`${PAGE}: must set storageKey="admin-launch-toggles"`);
  }
  if (!src.includes('tableTestId="admin-launch-toggles-table"')) {
    errors.push(`${PAGE}: must set tableTestId="admin-launch-toggles-table"`);
  }
  if (!src.includes("No carriers configured for launch toggles.")) {
    errors.push(`${PAGE}: must keep emptyText for empty carrier list`);
  }
  if (!src.includes("Couldn't load launch toggles")) {
    errors.push(`${PAGE}: must keep ListErrorState title for launch-toggles outage`);
  }
  if (!src.includes('"Launch"') && !src.includes("'Launch'")) {
    errors.push(`${PAGE}: must preserve Launch action button`);
  }
  if (!src.includes('"Rollback"') && !src.includes("'Rollback'")) {
    errors.push(`${PAGE}: must preserve Rollback action button`);
  }
  if (!src.includes("Launch toggles")) {
    errors.push(`${PAGE}: must keep Launch toggles page title`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "carrier", label: "Carrier" },
      { key: "status", label: "Status" },
      { key: "last_action", label: "Last action" },
      { key: "actions", label: "Actions" },
    ];
    <PageHeader title="Launch toggles" />
    <ListErrorState title="Couldn't load launch toggles" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="admin-launch-toggles"
      tableTestId="admin-launch-toggles-table"
      emptyText="No carriers configured for launch toggles."
    />
    "Launch"
    "Rollback"
  `;
  const bad = `
    export function LaunchTogglesPage() {
      return (
        <div>
          <table><thead><tr><th>Carrier</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + Launch/Rollback preserved.`);
}

main();
