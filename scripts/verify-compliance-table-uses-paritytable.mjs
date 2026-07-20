#!/usr/bin/env node
/**
 * verify-compliance-table-uses-paritytable — qbo-parity-a1 (ComplianceTable surface)
 *
 * Compliance dashboard Overview credentials grid must use shared ParityTable grammar
 * (sort/resize/gear/filterBar), not a hand-rolled <table>. Owner Name cells drill via
 * EntityLink when owner_type maps to driver/unit/trailer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-compliance-table-uses-paritytable";
const PAGE = "apps/frontend/src/components/compliance/ComplianceTable.tsx";

const REQUIRED_LABELS = ["Type", "Owner", "Name", "Expiration", "Days", "Severity", "Action"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must use EntityLink for owner Name drill-through`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>, found ${parityUses}`);
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
  if (!src.includes('storageKey="compliance-dashboard-credentials"')) {
    errors.push(`${PAGE}: must set storageKey="compliance-dashboard-credentials"`);
  }
  if (!src.includes("compliance-table-panel")) {
    errors.push(`${PAGE}: must preserve data-testid="compliance-table-panel"`);
  }
  if (!src.includes("Export CSV")) {
    errors.push(`${PAGE}: must keep Export CSV control in filterBar`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    import { EntityLink } from "../shared/EntityLink";
    const COLUMNS = [
      { key: "label", label: "Type" },
      { key: "owner_type", label: "Owner" },
      { key: "owner_name", label: "Name", render: (row) => <EntityLink kind="driver" id={row.owner_id} label={row.owner_name} /> },
      { key: "expiration_date", label: "Expiration" },
      { key: "days_until_expiration", label: "Days" },
      { key: "severity", label: "Severity" },
      { key: "action_link", label: "Action" },
    ];
    <div data-testid="compliance-table-panel">
      <ParityTable storageKey="compliance-dashboard-credentials" filterBar={<button>Export CSV</button>} />
    </div>
  `;
  const bad = `
    export function ComplianceTable() {
      return (
        <div data-testid="compliance-table-panel">
          <table><thead><tr><th>Type</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + EntityLink; columns preserved.`);
}

main();
