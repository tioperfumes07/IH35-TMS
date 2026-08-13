#!/usr/bin/env node
/**
 * @matrix-built {"modules":["settlements","accounting"],"cols":["settlement","driver","load","connectivity","reverse_link","liability"],"leafRe":"^(settlements\\.(list|detail|disputes)|settlement_close|pre_settlements|settlements\\.panel\\.(pre_settlements|pay_run_close)|settlements\\.drawer\\.(advance_detail|liability_detail)|settlements\\.modal\\.(hold_deduction|liability_breakdown)|escrow|owner_approval)$","task":"WAVE-A-settlement-column","vertical":"column-wave"}
 * Rule-17: pre-settlements reverse drill-through (Law §9).
 * Accounting + Settlements surfaces must EntityLink canonical settlement rows (Wave A `settlement`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-settlements-reverse-drill";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertEscrowCloseApprovalReverse() {
  const errors = [];
  const escrow = read("apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx");
  const close = read("apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx");
  const approval = read("apps/frontend/src/pages/driver-finance/OwnerApprovalPortalPage.tsx");

  if (!/EntityLink/.test(escrow) || !/kind="driver"/.test(escrow) || !/kind="load"/.test(escrow)) {
    errors.push("EscrowDeductionsPendingTab: driver + load must use EntityLink");
  }
  if (/navigate\(`\/dispatch\/loads\//.test(escrow)) {
    errors.push("EscrowDeductionsPendingTab: must not manual navigate to load — use EntityLink");
  }
  if (!/kind="driver"/.test(close) || !/kind="settlement"/.test(close) || !/first_load_id/.test(close)) {
    errors.push("SettlementCloseArrivalPage: driver, settlement, and load range must EntityLink");
  }
  if (!/kind="settlement"/.test(approval) || !/driver_history\.settlements/.test(approval)) {
    errors.push("OwnerApprovalPortalPage: settlement history must EntityLink");
  }
  return errors;
}

function assertPreSettlementsReverse() {
  const errors = [];
  const panel = read("apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx");
  const accountingPage = read("apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx");
  const table = read("apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx");
  const disputes = read("apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx");
  const header = read("apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx");
  const detail = read("apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");
  const payRun = read("apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx");
  const advanceDrawer = read("apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx");
  const liabilityDrawer = read("apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx");

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
  if (!/kind="settlement"/.test(table) || !/row\.id/.test(table)) {
    errors.push("SettlementsTable: must EntityLink settlement via row.id");
  }
  if (!/kind="settlement"/.test(disputes) || !/settlement_id/.test(disputes)) {
    errors.push("SettlementDisputesTab: must EntityLink settlement via settlement_id");
  }
  if (!/kind="settlement"/.test(header) || !/settlementId/.test(header)) {
    errors.push("SettlementHeader: must EntityLink settlement via settlementId");
  }
  if (!/settlementId=\{settlementId\}/.test(detail) && !/settlementId={settlementId}/.test(detail)) {
    errors.push("SettlementDetailPage: must pass settlementId into SettlementHeader");
  }
  if (!/kind="settlement"/.test(payRun) || !/settlementId/.test(payRun)) {
    errors.push("PayRunClosePanel: must EntityLink settlementId");
  }
  if (!/kind="settlement"/.test(advanceDrawer) || !/settlement_id/.test(advanceDrawer)) {
    errors.push("AdvanceDetailDrawer: must EntityLink settlement_history settlement_id");
  }
  if (!/kind="settlement"/.test(liabilityDrawer) || !/settlement_id/.test(liabilityDrawer)) {
    errors.push("LiabilityDetailDrawer: must EntityLink settlement_history settlement_id");
  }
  const holdModal = read("apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx");
  const liabilityModal = read("apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx");
  if (!/kind="settlement"/.test(holdModal) || !/settlementId/.test(holdModal)) {
    errors.push("HoldDeductionModal: must EntityLink settlementId from settlement detail");
  }
  if (!/kind="settlement"/.test(liabilityModal) || !/settlementId/.test(liabilityModal)) {
    errors.push("LiabilityBreakdownModal: must EntityLink settlementId from settlement detail");
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

const errors = [...assertPreSettlementsReverse(), ...assertEscrowCloseApprovalReverse()];
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
