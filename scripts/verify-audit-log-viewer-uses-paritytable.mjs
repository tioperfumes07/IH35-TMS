#!/usr/bin/env node
/**
 * verify-audit-log-viewer-uses-paritytable — qbo-parity-a1 (AuditLogViewer surface)
 *
 * SuperAdmin audit log viewer must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never a bare red banner).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-audit-log-viewer-uses-paritytable";
const PAGE = "apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx";

const REQUIRED_LABELS = ["When", "Event class", "Severity", "Actor", "Source"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (!src.includes('storageKey="audit-log-viewer"')) {
    errors.push(`${PAGE}: must set storageKey="audit-log-viewer"`);
  }
  if (!src.includes("onRowClick")) {
    errors.push(`${PAGE}: must keep onRowClick for AuditEventCard drill-down`);
  }
  if (!src.includes("No audit events found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty audit stream`);
  }
  if (!src.includes("Couldn't load audit log")) {
    errors.push(`${PAGE}: must keep ListErrorState title for audit outage`);
  }
  if (!src.includes('tableTestId="audit-log-viewer-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId="audit-log-viewer-table"`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "created_at", label: "When" },
      { key: "event_class", label: "Event class" },
      { key: "severity", label: "Severity" },
      { key: "actor_email", label: "Actor" },
      { key: "source", label: "Source" },
    ];
    <ListErrorState title="Couldn't load audit log" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="audit-log-viewer"
      emptyText="No audit events found."
      tableTestId="audit-log-viewer-table"
      onRowClick={(row) => setSelectedEvent(row)}
    />
  `;
  const bad = `
    export function AuditLogViewer() {
      return (
        <div>
          <p className="text-sm text-red-600">Failed to load.</p>
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
