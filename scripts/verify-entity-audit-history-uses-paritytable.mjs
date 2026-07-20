#!/usr/bin/env node
/**
 * verify-entity-audit-history-uses-paritytable — qbo-parity-a1 (EntityAuditHistoryTab)
 *
 * Shared entity audit history (vendor/customer/driver/unit/load/WO) must use shared
 * ParityTable grammar (sort/resize/gear + renderExpanded Before→After diff), not a
 * hand-rolled <table>. Outages must surface ListErrorState (never a bare red banner).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entity-audit-history-uses-paritytable";
const PAGE = "apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx";

const REQUIRED_LABELS = ["When", "Who", "Action", "Summary", "Source"];

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
  if (!src.includes("renderExpanded")) {
    errors.push(`${PAGE}: must keep renderExpanded for Before→After field diff`);
  }
  if (!src.includes("ChangesDiff")) {
    errors.push(`${PAGE}: must keep ChangesDiff in expanded detail`);
  }
  if (!src.includes("No audit events found for this record.")) {
    errors.push(`${PAGE}: must keep emptyText for empty audit stream`);
  }
  if (!src.includes("Couldn't load audit history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for audit outage`);
  }
  if (!src.includes("entity-audit-history-")) {
    errors.push(`${PAGE}: must set storageKey entity-audit-history-{entityType}`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    function ChangesDiff() { return null; }
    const COLUMNS = [
      { key: "created_at", label: "When" },
      { key: "actor_email", label: "Who" },
      { key: "event_type", label: "Action" },
      { key: "summary", label: "Summary" },
      { key: "source", label: "Source" },
    ];
    <ListErrorState title="Couldn't load audit history" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey={\`entity-audit-history-\${entityType}\`}
      emptyText="No audit events found for this record."
      renderExpanded={(event) => <ChangesDiff changes={event.payload?.changes} />}
    />
  `;
  const bad = `
    export function EntityAuditHistoryTab() {
      return (
        <div>
          <div>Failed to load audit history</div>
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
