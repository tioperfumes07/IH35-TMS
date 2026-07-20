#!/usr/bin/env node
/**
 * verify-activity-log-uses-paritytable — qbo-parity-a1 (ActivityLogPage surface)
 *
 * Admin activity audit stream must use shared ParityTable grammar (sort/resize/gear +
 * renderExpanded payload detail), not a hand-rolled <table>. Outages must surface
 * ListErrorState (never a bare red banner or false-empty "No audit rows").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-activity-log-uses-paritytable";
const PAGE = "apps/frontend/src/pages/admin/ActivityLogPage.tsx";

const REQUIRED_LABELS = ["Time", "Actor", "Action", "Entity", "Payload preview"];

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
  if (!src.includes('storageKey="admin-activity-log"')) {
    errors.push(`${PAGE}: must set storageKey="admin-activity-log"`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for full payload JSON detail`);
  }
  if (!src.includes("No audit rows matched these filters.")) {
    errors.push(`${PAGE}: must keep emptyText for filtered-empty stream`);
  }
  if (!src.includes("Couldn't load activity log")) {
    errors.push(`${PAGE}: must keep ListErrorState title for activity outage`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "created_at", label: "Time" },
      { key: "actor_email", label: "Actor" },
      { key: "action", label: "Action" },
      { key: "entity_type", label: "Entity" },
      { key: "payload_preview", label: "Payload preview" },
    ];
    <ListErrorState title="Couldn't load activity log" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="admin-activity-log"
      emptyText="No audit rows matched these filters."
      renderExpanded={(row) => <pre>{JSON.stringify(row.payload)}</pre>}
    />
  `;
  const bad = `
    export function ActivityLogPage() {
      return (
        <div>
          <div>Failed to load activity log.</div>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
