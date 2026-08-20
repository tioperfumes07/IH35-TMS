#!/usr/bin/env node
/**
 * verify-driver-audit-history-uses-paritytable — qbo-parity-a1 (AuditHistoryTab surface)
 *
 * Drivers hub Audit History tab must use shared ParityTable grammar (sort/resize/gear +
 * renderExpanded payload detail), not a hand-rolled <table>. Outages must surface
 * ListErrorState (never a bare red banner or false-empty "No audit events").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-audit-history-uses-paritytable";
const PAGE = "apps/frontend/src/components/drivers/AuditHistoryTab.tsx";

const REQUIRED_LABELS = ["When", "Actor", "Event", "Summary", "Details"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
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
  if (!src.includes('storageKey="driver-audit-history"')) {
    errors.push(`${PAGE}: must set storageKey="driver-audit-history"`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for payload/diff detail`);
  }
  if (!src.includes("No audit events for this driver.")) {
    errors.push(`${PAGE}: must keep emptyText for empty audit stream`);
  }
  if (!src.includes("Couldn't load audit history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for audit outage`);
  }
  if (!src.includes('tableTestId="driver-audit-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId="driver-audit-table"`);
  }
  if (!/<EntityLinkOrTombstone\s+kind="user"\s+id=\{row\.actor_user_id\}\s+name=\{row\.actor_email\}\s+noun="User"/.test(src)) {
    errors.push(`${PAGE}: unresolved audit actors must render a non-clickable user tombstone`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [
      { key: "created_at", label: "When" },
      { key: "actor_email", label: "Actor" },
      { key: "event_type", label: "Event" },
      { key: "summary", label: "Summary" },
      { key: "details", label: "Details" },
    ];
    <ListErrorState title="Couldn't load audit history" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="driver-audit-history"
      emptyText="No audit events for this driver."
      tableTestId="driver-audit-table"
      renderExpanded={(row) => <pre>{payloadDiff(row.payload)}</pre>}
    />
    <EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_email} noun="User" />
  `;
  const bad = `
    export function AuditHistoryTab() {
      return (
        <div>
          <p className="text-sm text-red-600">Unable to load audit history.</p>
          <table><thead><tr><th>When</th></tr></thead></table>
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
