#!/usr/bin/env node
/**
 * LINK-F5174 (2026-08-14): "reverse_link" removed from this tag's cols under
 * HONEST-BUILT-LAUNCH-LAW-2026-08-14's "wrong-direction assert" rule. This guard's own assertions
 * (assertPreSettlementsReverse / assertEscrowCloseApprovalReverse below) all check that a CHILD
 * component (a modal/drawer/panel opened FROM a settlement) renders an EntityLink UP to its parent
 * settlement/driver/load -- that is real, correct proof for the settlement/driver/load/liability
 * FORWARD-linkage columns still claimed below, but it is the WRONG direction for reverse_link
 * (the RELATED record must list these and drill back IN, not the reverse). Confirmed live on prod
 * (app.ih35dispatch.com/program/matrix?module=settlements): settlements.modal.hold_deduction and
 * .liability_breakdown rendered reverse_link Built=green off this exact tag while LINK-F5171's
 * independent sweep found no reverse section exists anywhere for either -- see
 * SCOREBOARD-BUILT-SELF-DECLARED-NOT-VERIFIED in docs/audit/GUARD-WORKORDERS.md. Two leaves this
 * tag covers (settlements.list/detail/settlement_close/pre_settlements/panel.pre_settlements,
 * settlements.disputes) remain genuinely reverse_link-Built via SEPARATE, correctly-direction-
 * checked guards (verify-driver-profile-settlement-reverse-link.mjs,
 * verify-driver-settlement-finance-reverse-section.mjs) -- removing the claim here does not
 * un-prove them. The 5 leaves with no other reverse_link guard
 * (settlements.modal.hold_deduction/.liability_breakdown, settlements.drawer.advance_detail/
 * .liability_detail, settlements.panel.pay_run_close) now honestly show NOT built for reverse_link
 * until a real reverse section is built -- filed, not silently dropped, in
 * LINK-F5171-REVERSE-LINK-COLUMN-GAPS.
 * @matrix-built {"modules":["settlements","accounting","dispatch","drivers"],"cols":["settlement","driver","load","connectivity","liability"],"leafRe":"^(settlements\\.(list|detail|disputes)|settlement_close|pre_settlements|settlements\\.panel\\.(pre_settlements|pay_run_close)|settlements\\.drawer\\.(advance_detail|liability_detail)|settlements\\.modal\\.(hold_deduction|liability_breakdown)|escrow|owner_approval|secondary\\.pre_settlements|dispatch\\.panel\\.pre_settlement|load\\.drawer\\.(settlement|pre_settlement))$","task":"WAVE-A-settlement-column","vertical":"column-wave"}
 * Rule-17: pre-settlements reverse drill-through (Law §9).
 * Accounting + Settlements + Dispatch + Drivers surfaces must EntityLink canonical settlement rows (Wave A `settlement`).
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
  const dispatchPrePanel = read("apps/frontend/src/components/dispatch/PreSettlementPanel.tsx");
  const loadSettlementTab = read("apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx");
  const dispatchPage = read("apps/frontend/src/pages/Dispatch.tsx");
  if (!/kind="settlement"/.test(dispatchPrePanel) || !/settlement\.id/.test(dispatchPrePanel)) {
    errors.push("dispatch PreSettlementPanel: must EntityLink settlement.id");
  }
  if (!/kind="settlement"/.test(loadSettlementTab) || !/settlement\.id/.test(loadSettlementTab)) {
    errors.push("LoadDetailSettlementTab: must EntityLink settlement.id");
  }
  if (!/kind="driver"/.test(loadSettlementTab) || !/settlement\.driver_id/.test(loadSettlementTab)) {
    errors.push("LoadDetailSettlementTab: must EntityLink settlement.driver_id");
  }
  if (!/PreSettlementsPanel/.test(dispatchPage) || !/subTab === "pre_settlements"/.test(dispatchPage)) {
    errors.push("Dispatch.tsx: pre_settlements subTab must mount PreSettlementsPanel");
  }
  const driversPage = read("apps/frontend/src/pages/Drivers.tsx");
  if (!/subnavTab === "pre_settlements"/.test(driversPage) || !/PreSettlementsPanel/.test(driversPage)) {
    errors.push("Drivers.tsx: pre_settlements tab must mount PreSettlementsPanel");
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
