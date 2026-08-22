#!/usr/bin/env node
/**
 * SETL-F5795 — exact settlement/driver/load linkage contracts across the
 * pre-settlement and settlement-child surfaces. Reverse-link Built credit is
 * intentionally owned by narrower correctly-directed guards; this guard keeps
 * the forward/drill contracts it historically claimed.
 *
 * Self-test: node scripts/verify-pre-settlements-reverse-drill.mjs --selftest
 * @matrix-built {"modules":["settlements","accounting","dispatch","drivers"],"cols":["settlement","driver","load","connectivity","liability"],"leafRe":"^(settlements\\.(list|detail|disputes)|settlement_close|pre_settlements|settlements\\.panel\\.(pre_settlements|pay_run_close)|settlements\\.drawer\\.(advance_detail|liability_detail)|settlements\\.modal\\.(hold_deduction|liability_breakdown)|escrow|owner_approval|secondary\\.pre_settlements|dispatch\\.panel\\.pre_settlement|load\\.drawer\\.(settlement|pre_settlement))$","task":"WAVE-A-settlement-column","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["reverse_link"],"leaves":["settlements.detail","settlement_close"],"task":"SETL-F5835"}
 * @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.pre_settlement","dispatch.panel.pre_settlement"],"task":"DISP-F5868-PRE-SETTLEMENT-REVERSE-EXACT-LEAVES","vertical":"column-wave"}
 */
import fs from "node:fs";

const LABEL = "verify-pre-settlements-reverse-drill";
const F = {
  escrow: "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx",
  close: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
  approval: "apps/frontend/src/pages/driver-finance/OwnerApprovalPortalPage.tsx",
  panel: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
  accounting: "apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  table: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
  disputes: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
  header: "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx",
  detail: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  payRun: "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx",
  advance: "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  liability: "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
  hold: "apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx",
  liabilityModal: "apps/frontend/src/pages/driver-finance/components/LiabilityBreakdownModal.tsx",
  dispatchPre: "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx",
  loadSettlement: "apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx",
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
  drivers: "apps/frontend/src/pages/Drivers.tsx",
  settlementsPage: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
  driverSettlements: "apps/frontend/src/components/driver-profile/SettlementsSection.tsx",
  matrix: "docs/specs/scoreboard/modules/settlements.required.json",
  dispatchMatrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  self: "scripts/verify-pre-settlements-reverse-drill.mjs",
};

const CHECKS = [
  { name: "exact detail/close reverse Built annotation", file: F.self, pattern: /^ \* @matrix-built \{"modules":\["settlements"\],"cols":\["reverse_link"\],"leaves":\["settlements\.detail","settlement_close"\],"task":"SETL-F5835"\}$/m },
  { name: "exact dispatch pre-settlement reverse Built annotation", file: F.self, pattern: /^ \* @matrix-built \{"modules":\["dispatch"\],"cols":\["reverse_link"\],"leaves":\["load\.drawer\.pre_settlement","dispatch\.panel\.pre_settlement"\],"task":"DISP-F5868-PRE-SETTLEMENT-REVERSE-EXACT-LEAVES","vertical":"column-wave"\}$/m },
  { name: "settlement detail selected-company read", file: F.detail, pattern: /queryKey: \["driver-finance", "settlement-detail", settlementId, companyId\][\s\S]{0,160}getSettlement\(settlementId!, companyId\)[\s\S]{0,100}enabled: Boolean\(settlementId && companyId\)/ },
  { name: "settlement detail route-param mount", file: F.settlementsPage, pattern: /selectedSettlementId = searchParams\.get\("settlement_id"\)[\s\S]{0,10000}selectedSettlementId && activeTab === "settlements"[\s\S]{0,1500}<SettlementDetailPage \/>/ },
  { name: "driver profile exact settlement return", file: F.driverSettlements, pattern: /kind="settlement"\s+id=\{row\.settlement_id\}[\s\S]{0,160}entityLabel\(row\.week_ending \|\| null, row\.settlement_id, "Settlement"\)/ },
  { name: "settlement close route mounted", file: F.manifest, pattern: /path="\/driver-finance\/settlement-close"[\s\S]{0,180}<SettlementCloseArrivalPage \/>/ },
  { name: "settlement close company-scoped list", file: F.close, pattern: /listOpenPreSettlements\(companyId\)[\s\S]{0,100}enabled: Boolean\(companyId\)/ },
  { name: "settlement close company-driver detail", file: F.close, pattern: /getPreSettlementForDriver\(String\(selectedDriverId\), companyId\)[\s\S]{0,100}enabled: Boolean\(companyId\) && Boolean\(selectedDriverId\)/ },
  { name: "settlement close exact settlement return", file: F.close, pattern: /kind="settlement"\s+id=\{settlement\.id\}\s+label=\{entityLabel\(settlement\.display_id, settlement\.id, "Settlement"\)\}/ },
  { name: "escrow driver drill", file: F.escrow, pattern: /kind="driver" id=\{row\.driver_id\} label=\{entityLabel\(row\.driver_name, row\.driver_id, "Driver"\)\}/ },
  { name: "escrow load drill", file: F.escrow, pattern: /kind="load" id=\{row\.load_id\} label=\{entityLabel\(row\.load_number, row\.load_id, "Load"\)\}/ },
  { name: "escrow bans manual load navigation", file: F.escrow, banned: /navigate\(`\/dispatch\/loads\// },
  { name: "close driver drill", file: F.close, pattern: /kind="driver"/ },
  { name: "close settlement drill", file: F.close, pattern: /kind="settlement"/ },
  { name: "close load-range FK", file: F.close, pattern: /kind="load"\s+id=\{settlement\.first_load_id \?\? ""\}\s+label=\{entityLabel\(settlement\.first_load_number, settlement\.first_load_id, "Load"\)\}/ },
  { name: "approval settlement drill", file: F.approval, pattern: /kind="settlement"/ },
  { name: "approval settlement history source", file: F.approval, pattern: /data\.driver_history\.settlements\.map\(\(s\)[\s\S]{0,500}id=\{settlementId\}[\s\S]{0,220}s\.display_id/ },
  { name: "pre-settlement EntityLink import", file: F.panel, pattern: /from ["']\.\.\/shared\/EntityLink["']/ },
  { name: "pre-settlement exact driver drill", file: F.panel, pattern: /kind="driver"[\s\S]{0,180}settlement\.driver_id/ },
  { name: "pre-settlement exact settlement drill", file: F.panel, pattern: /kind="settlement"[\s\S]{0,180}settlement\.id/ },
  { name: "pre-settlement row marker", file: F.panel, pattern: /data-testid="pre-settlement-row-reverse"/ },
  { name: "accounting mounts pre-settlements", file: F.accounting, pattern: /<PreSettlementsPanel/ },
  { name: "accounting pre-settlements route", file: F.manifest, pattern: /path="\/accounting\/pre-settlements"/ },
  { name: "settlement table exact row drill", file: F.table, pattern: /kind="settlement"[\s\S]{0,180}row\.id/ },
  { name: "dispute exact settlement drill", file: F.disputes, pattern: /kind="settlement"[\s\S]{0,180}settlement_id/ },
  { name: "settlement header exact drill", file: F.header, pattern: /kind="settlement"[\s\S]{0,180}settlementId/ },
  { name: "detail threads settlement id", file: F.detail, pattern: /<SettlementHeader\s+settlementId=\{settlementId\}/ },
  { name: "pay-run exact settlement drill", file: F.payRun, pattern: /kind="settlement"[\s\S]{0,180}settlementId/ },
  { name: "advance history settlement drill", file: F.advance, pattern: /kind="settlement"[\s\S]{0,220}settlement_id/ },
  { name: "liability history settlement drill", file: F.liability, pattern: /kind="settlement"[\s\S]{0,220}settlement_id/ },
  { name: "hold modal settlement drill", file: F.hold, pattern: /kind="settlement"[\s\S]{0,180}settlementId/ },
  { name: "liability modal settlement drill", file: F.liabilityModal, pattern: /kind="settlement"[\s\S]{0,180}settlementId/ },
  { name: "dispatch pre-panel settlement drill", file: F.dispatchPre, pattern: /kind="settlement"[\s\S]{0,180}settlement\.id/ },
  { name: "load settlement exact settlement drill", file: F.loadSettlement, pattern: /kind="settlement"[\s\S]{0,180}settlement\.id/ },
  { name: "load settlement exact driver drill", file: F.loadSettlement, pattern: /kind="driver"[\s\S]{0,180}settlement\.driver_id/ },
  { name: "dispatch mounts pre-settlements subtab", file: F.dispatch, pattern: /subTab === "pre_settlements"[\s\S]{0,1200}<PreSettlementsPanel/ },
  { name: "drivers mounts pre-settlements subnav", file: F.drivers, pattern: /subnavTab === "pre_settlements"[\s\S]{0,1200}<PreSettlementsPanel/ },
];

function readSources() {
  return Object.fromEntries([...new Set(Object.values(F))].map((file) => [file, fs.readFileSync(file, "utf8")]));
}

export function collectFailures(sources) {
  const failures = CHECKS.filter((check) =>
    check.banned ? check.banned.test(sources[check.file]) : !check.pattern.test(sources[check.file])
  ).map((check) => check.name);
  try {
    const matrix = JSON.parse(sources[F.matrix]);
    for (const id of ["settlements.detail", "settlement_close"]) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`exact Required ownership: ${id}:reverse_link`);
    }
  } catch {
    failures.push("settlements Required matrix parses");
  }
  try {
    const matrix = JSON.parse(sources[F.dispatchMatrix]);
    for (const id of ["load.drawer.pre_settlement", "dispatch.panel.pre_settlement"]) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`exact dispatch Required ownership: ${id}:reverse_link`);
    }
  } catch {
    failures.push("dispatch Required matrix parses");
  }
  return failures;
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(sources);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const inert = [];
  for (const check of CHECKS) {
    const original = sources[check.file];
    const planted = check.banned
      ? `${original}\n/* planted */ navigate(\`/dispatch/loads/poison\`);\n`
      : original.replace(check.pattern, "/* planted SETL-F5795 linkage defect */");
    if (planted === original || !collectFailures({ ...sources, [check.file]: planted }).includes(check.name)) inert.push(check.name);
  }
  for (const id of ["settlements.detail", "settlement_close"]) {
    const planted = sources[F.matrix].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (planted === sources[F.matrix] || !collectFailures({ ...sources, [F.matrix]: planted }).includes(`exact Required ownership: ${id}:reverse_link`)) inert.push(`matrix ${id}`);
  }
  for (const id of ["load.drawer.pre_settlement", "dispatch.panel.pre_settlement"]) {
    const planted = sources[F.dispatchMatrix].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (planted === sources[F.dispatchMatrix] || !collectFailures({ ...sources, [F.dispatchMatrix]: planted }).includes(`exact dispatch Required ownership: ${id}:reverse_link`)) inert.push(`dispatch matrix ${id}`);
  }
  if (inert.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: inert plants: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${CHECKS.length + 4}/${CHECKS.length + 4} independent settlement linkage plants`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact settlement linkage obligations ratcheted`);
