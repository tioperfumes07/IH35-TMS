#!/usr/bin/env node
/**
 * Rule-17: pre-settlements reverse drill-through (Law §9).
 * Accounting + Dispatch pre-settlement rows must EntityLink driver + settlement.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-settlements-reverse-drill";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertPreSettlementsReverse() {
  const errors = [];
  const panel = read("apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx");
  const accountingPage = read("apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx");

  if (!/from "\.\.\/shared\/EntityLink"/.test(panel) && !/from '\.\.\/shared\/EntityLink'/.test(panel)) {
    errors.push("PreSettlementsPanel: must import EntityLink");
  }
  if (!/kind="driver"/.test(panel) || !/settlement\.driver_id/.test(panel)) {
    errors.push("PreSettlementsPanel: must EntityLink driver via settlement.driver_id");
  }
  if (!/kind="settlement"/.test(panel) || !/settlement\.id/.test(panel)) {
    errors.push("PreSettlementsPanel: must EntityLink settlement via settlement.id");
  }
  if (!/data-testid="pre-settlement-row-reverse"/.test(panel)) {
    errors.push("PreSettlementsPanel: reverse marker data-testid missing");
  }
  if (!/PreSettlementsPanel/.test(accountingPage)) {
    errors.push("AccountingPreSettlementsPage: must render PreSettlementsPanel");
  }
  if (!/\/accounting\/pre-settlements/.test(read("apps/frontend/src/routes/manifest.tsx"))) {
    errors.push("manifest: /accounting/pre-settlements route missing");
  }
  return errors;
}

function selftest() {
  const good = `
    import { EntityLink } from "../shared/EntityLink";
    <DataPanelRow data-testid="pre-settlement-row-reverse">
      <EntityLink kind="driver" id={settlement.driver_id} />
      <EntityLink kind="settlement" id={settlement.id} />
    </DataPanelRow>
  `;
  const bad = `<span>{settlement.driver_full_name}</span>`;
  const goodOk = /kind="driver"/.test(good) && /kind="settlement"/.test(good);
  const badOk = !/kind="driver"/.test(bad);
  if (!goodOk || !badOk) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPreSettlementsReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
