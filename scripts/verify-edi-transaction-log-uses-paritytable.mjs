#!/usr/bin/env node
/**
 * verify-edi-transaction-log-uses-paritytable — qbo-parity-a1 (EdiTransactionLog surface)
 *
 * EDI transaction log must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never a false-empty
 * grid). Columns Type/Dir/Status/Control #/Received preserved 1:1; status filter +
 * raw EDI viewer side panel + edi-transaction-log testid retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-edi-transaction-log-uses-paritytable";
const PAGE = "apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx";

const REQUIRED_LABELS = ["Type", "Dir", "Status", "Control #", "Received"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
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
  if (!src.includes('storageKey="edi-transaction-log"')) {
    errors.push(`${PAGE}: must set storageKey="edi-transaction-log"`);
  }
  if (!src.includes('tableTestId="edi-transaction-log-table"')) {
    errors.push(`${PAGE}: must set tableTestId="edi-transaction-log-table"`);
  }
  if (!src.includes("edi-transaction-log")) {
    errors.push(`${PAGE}: must preserve data-testid="edi-transaction-log"`);
  }
  if (!src.includes("No EDI messages yet")) {
    errors.push(`${PAGE}: must keep emptyText for empty log`);
  }
  if (!src.includes("Couldn't load EDI messages")) {
    errors.push(`${PAGE}: must keep ListErrorState title for outage`);
  }
  if (!src.includes("/api/integrations/edi/messages")) {
    errors.push(`${PAGE}: must keep messages API call`);
  }
  if (!src.includes("Raw EDI viewer")) {
    errors.push(`${PAGE}: must keep raw EDI viewer side panel`);
  }
  if (!src.includes('<option value="failed">Failed</option>')) {
    errors.push(`${PAGE}: must keep status filter dropdown`);
  }
  if (!src.includes("onRowClick")) {
    errors.push(`${PAGE}: must keep onRowClick for message selection`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "transaction_type", label: "Type" },
      { key: "direction", label: "Dir" },
      { key: "status", label: "Status" },
      { key: "control_number", label: "Control #" },
      { key: "received_at", label: "Received" },
    ];
    fetch("/api/integrations/edi/messages");
    <div data-testid="edi-transaction-log">
      <option value="failed">Failed</option>
      <ListErrorState title="Couldn't load EDI messages" status={0} onRetry={() => {}} />
      <h3>Raw EDI viewer</h3>
      <ParityTable
        storageKey="edi-transaction-log"
        tableTestId="edi-transaction-log-table"
        emptyText="No EDI messages yet"
        onRowClick={() => {}}
      />
    </div>
  `;
  const bad = `
    export function EdiTransactionLog() {
      return (
        <div data-testid="edi-transaction-log">
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + edi-transaction-log testid preserved.`);
}

main();
