#!/usr/bin/env node
/**
 * verify-audit-trail-uses-paritytable — qbo-parity-a1 (AuditTrailPage surface)
 *
 * Universal spine audit trail must use shared ParityTable grammar (sort/resize/gear +
 * renderExpanded payload detail), not a hand-rolled <table>. Outages must surface
 * ListErrorState (never a bare red banner or false-empty).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-audit-trail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/audit/AuditTrailPage.tsx";

const REQUIRED_LABELS = ["When", "Event type", "Actor", "Entity", "Source"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (!src.includes('storageKey="audit-trail-page"')) {
    errors.push(`${PAGE}: must set storageKey="audit-trail-page"`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for payload/correlation detail`);
  }
  if (!src.includes("No events found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty audit stream`);
  }
  if (!src.includes("Couldn't load audit trail")) {
    errors.push(`${PAGE}: must keep ListErrorState title for audit outage`);
  }
  if (!src.includes('tableTestId="audit-trail-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId="audit-trail-table"`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "occurred_at", label: "When" },
      { key: "event_type", label: "Event type" },
      { key: "actor_email", label: "Actor" },
      { key: "subject_type", label: "Entity" },
      { key: "source_table", label: "Source" },
    ];
    <ListErrorState title="Couldn't load audit trail" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="audit-trail-page"
      emptyText="No events found."
      tableTestId="audit-trail-table"
      renderExpanded={(row) => <pre>{JSON.stringify(row.payload)}</pre>}
    />
  `;
  const bad = `
    export function AuditTrailPage() {
      return (
        <div>
          <p className="text-sm text-red-600">Failed to load audit trail.</p>
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
