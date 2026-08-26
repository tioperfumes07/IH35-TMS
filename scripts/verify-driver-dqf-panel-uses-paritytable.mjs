#!/usr/bin/env node
/**
 * Locks the Driver DQF checklist to the shared table and error-state grammar.
 * The panel contains compliance evidence, so it must retain its status actions
 * while providing sortable, resizable, user-configurable columns.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-dqf-panel-uses-paritytable";
const PANEL = "apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx";
const REQUIRED_LABELS = ["Item", "Status", "Effective", "Expiry", "Expiry pill"];

function assertMigrated(src) {
  const errors = [];

  if (!src.includes('from "../../../components/parity/ParityTable"')) {
    errors.push(`${PANEL}: must import the shared ParityTable`);
  }
  if (!src.includes('from "../../../components/ListErrorState"')) {
    errors.push(`${PANEL}: must import ListErrorState for failed DQF loads`);
  }
  if (!src.includes("<ParityTable<DriverQualificationFileItem>")) {
    errors.push(`${PANEL}: expected DriverQualificationFileItem ParityTable`);
  }
  if (/<table[\s>]/.test(src) || /<thead[\s>]/.test(src)) {
    errors.push(`${PANEL}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PANEL}: missing DQF column label "${label}"`);
    }
  }
  if (!src.includes('storageKey="driver-dqf-checklist"')) {
    errors.push(`${PANEL}: must persist DQF table preferences`);
  }
  if (!src.includes('tableTestId="driver-dqf-checklist-table"')) {
    errors.push(`${PANEL}: must retain a stable DQF table test id`);
  }
  if (!src.includes("itemsQ.isError") || !src.includes('title="Couldn\'t load DQF checklist"')) {
    errors.push(`${PANEL}: must render ListErrorState when the DQF query fails`);
  }
  if (!src.includes("onRetry={() => void itemsQ.refetch()}")) {
    errors.push(`${PANEL}: must provide a DQF query retry action`);
  }
  if (!/patchMutation\.mutate\(\{[\s\S]*?id:\s*item\.id,[\s\S]*?status,[\s\S]*?companyId,[\s\S]*?driverId,[\s\S]*?generation:\s*scopeGenerationRef\.current[\s\S]*?\}\)/.test(src)) {
    errors.push(`${PANEL}: must preserve DQF status actions`);
  }

  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable } from "../../../components/parity/ParityTable";
    type DriverQualificationFileItem = { id: string };
    const itemsQ = { isError: true, refetch() {} };
    const patchMutation = { mutate() {} };
    const item = { id: "dqf-1" };
    const status = "present";
    {itemsQ.isError ? <ListErrorState title="Couldn't load DQF checklist" onRetry={() => void itemsQ.refetch()} /> : null}
    <ParityTable<DriverQualificationFileItem>
      storageKey="driver-dqf-checklist"
      tableTestId="driver-dqf-checklist-table"
      columns={[
        { key: "item_name", label: "Item" },
        { key: "status", label: "Status" },
        { key: "effective_date", label: "Effective" },
        { key: "expiry_date", label: "Expiry" },
        { key: "expiry_pill", label: "Expiry pill" },
      ]}
    />
    const companyId = "company-1";
    const driverId = "driver-1";
    const scopeGenerationRef = { current: 1 };
    patchMutation.mutate({ id: item.id, status, companyId, driverId, generation: scopeGenerationRef.current });
  `;
  const bad = `<table><thead><tr><th>Item</th></tr></thead></table>`;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length > 0 || badErrors.length < 5) {
    console.error(`${LABEL} --selftest FAIL`, { goodErrors, badErrors });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PANEL), "utf8"));
  if (errors.length > 0) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: Driver DQF uses ParityTable and ListErrorState with actions preserved.`);
}
