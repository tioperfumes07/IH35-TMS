#!/usr/bin/env node
/**
 * verify-audit-events-list-uses-paritytable — qbo-parity-a1 (AuditEventsList surface)
 *
 * Bulk-call forensic audit events list must use shared ParityTable grammar (sort/resize/gear +
 * renderExpanded payload detail), not DataTable or a hand-rolled <table>. Outages must surface
 * ListErrorState (never dataTableErrorState or a false-empty mid-fetch).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-audit-events-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/audit/AuditEventsList.tsx";

const REQUIRED_LABELS = ["When", "Event", "Actor", "Bulk Call", "Source"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  if (src.includes("dataTableErrorState")) {
    errors.push(`${PAGE}: must not use dataTableErrorState — use ListErrorState instead`);
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
  if (!src.includes('storageKey="audit-events-list"')) {
    errors.push(`${PAGE}: must set storageKey="audit-events-list"`);
  }
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for payload JSON detail`);
  }
  if (!src.includes("No audit events found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty audit stream`);
  }
  if (!src.includes("Couldn't load audit events")) {
    errors.push(`${PAGE}: must keep ListErrorState title for audit events outage`);
  }
  if (!src.includes('tableTestId="audit-events-list-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId="audit-events-list-table"`);
  }
  if (!src.includes("bulkCallPreview")) {
    errors.push(`${PAGE}: must preserve bulkCallPreview helper for bulk_call_id column`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    function bulkCallPreview(id) { return id; }
    const COLUMNS = [
      { key: "created_at", label: "When" },
      { key: "event_type", label: "Event" },
      { key: "actor_email", label: "Actor" },
      { key: "bulk_call_id", label: "Bulk Call" },
      { key: "source", label: "Source" },
    ];
    <ListErrorState title="Couldn't load audit events" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="audit-events-list"
      emptyText="No audit events found."
      tableTestId="audit-events-list-table"
      renderExpanded={(row) => <pre>{JSON.stringify(row.payload)}</pre>}
    />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { dataTableErrorState } from "../../lib/tableError";
    export function AuditEventsList() {
      return (
        <DataTable
          errorState={dataTableErrorState()}
          emptyText="No audit events found."
        />
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
