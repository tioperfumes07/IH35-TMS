#!/usr/bin/env node
/**
 * Settlements qbo_chrome — leaf-specific Built for surfaces that already use
 * QBO chrome (ParityTable / MoneyInput / DatePicker / EntityPicker / PaymentMethodPicker).
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*" / word-blanket |settlements|; only leaves with
 * required qbo_chrome + real asserts below.
 *
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^cash_advances$","task":"VERTICAL-QBO-CHROME-settlements-cash-advances","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^settlement_close$","task":"VERTICAL-QBO-CHROME-settlements-close","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^settlements\\.panel\\.open_driver_bills$","task":"VERTICAL-QBO-CHROME-settlements-open-bills","vertical":"column-wave"}
 * @matrix-built {"modules":["settlements"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-settlements-toolbar-filter","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-settlements-qbo-chrome-surfaces.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from './lib/entity-multiselect-filter-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-qbo-chrome-surfaces";

const CHECKS = [
  {
    name: "CashAdvanceRequestsPage +Create + EntityPicker filter + MoneyInput",
    file: "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx",
    pattern:
      /\+ Create[\s\S]*dataTestId="cash-advance-requests-filter-driver"[\s\S]*MoneyInput[\s\S]*ariaLabel="Cash advance amount"/,
  },
  {
    name: "SettlementCloseArrivalPage PaymentMethodPicker + CreateDriverModal",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern: /PaymentMethodPicker[\s\S]*CreateDriverModal|CreateDriverModal[\s\S]*PaymentMethodPicker/,
  },
  {
    name: "SettlementCloseArrivalPage + Create driver affordance",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern: /\+ Create driver/,
  },
  // ROUND 443.280-A Settlements-Close.png — working 7-step wizard (no 6-tile KPI strip).
  // Same closeSettlementPayRun / settleAndPay / line totals; board REPLACES body.
  {
    name: "SettlementCloseArrivalPage wizardStep + clickable steps + working Next",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern:
      /useState<CloseWizardStep>[\s\S]*data-settlement-close-v3-steps="1"[\s\S]*settlement-close-step-[\s\S]*settlement-close-next|wizardStep[\s\S]*setWizardStep[\s\S]*data-settlement-close-v3-steps="1"[\s\S]*settlement-close-next/,
    forbiddenNear: {
      pattern: /export function SettlementCloseArrivalPage[\s\S]*/,
      forbid: /data-settlement-close-v3-kpis|V3KpiTile/,
      message: "443.280-A: Close board has no 6-tile KPI strip (V3KpiTile / data-settlement-close-v3-kpis forbidden)",
    },
  },
  {
    name: "SettlementCloseArrivalPage V3 step strip + V3Panel board",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern: /data-settlement-close-v3-steps="1"[\s\S]*V3Panel|V3Panel[\s\S]*data-settlement-close-v3-steps="1"/,
  },
  // ROUND 443.274-C Settlements-Close.dc.html — 2fr|1fr Driver on arrival | Result (getTourReadout legs).
  {
    name: "SettlementCloseArrivalPage 2fr|1fr board Driver on arrival + Result",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern:
      /data-settlement-close-v3-board="1"[\s\S]*Driver on arrival[\s\S]*Miles \(doc\)[\s\S]*Result|data-settlement-close-v3-board="1"[\s\S]*getTourReadout/,
  },
  {
    name: "SettlementCloseArrivalPage board Miles (doc) from tour readout + bills",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    pattern: /milesDocForLeg[\s\S]*miles_basis[\s\S]*miles_practical|function milesDocForLeg/,
  },
  // ROUND 443.274-C Settlements-Company.dc.html — per-tour table via listTours(closed).
  // Same TourListRow engines (revenue/costs/driver_pay/margin); chrome + board columns.
  {
    name: "CompanySettlementsPage listTours closed board grain",
    file: "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx",
    pattern: /listTours\(companyId,\s*"closed"\)/,
  },
  {
    name: "CompanySettlementsPage board columns Company·Driver settlement·Revenue·Margin %",
    file: "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx",
    pattern:
      /label: "Company settlement"[\s\S]*label: "Driver settlement"[\s\S]*label: "Driver"[\s\S]*label: "Revenue"[\s\S]*label: "Costs"[\s\S]*label: "Driver pay"[\s\S]*label: "Margin"[\s\S]*label: "Margin %"/,
  },
  {
    name: "CompanySettlementsPage not opened amber + No number red",
    file: "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx",
    pattern: /not opened[\s\S]*No number|No number[\s\S]*not opened/,
  },
  {
    name: "CompanySettlementsPage V3Panel + QBO_MONEY_CELL_CLASS money columns",
    file: "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx",
    pattern:
      /data-company-settlements-v3-panel="1"[\s\S]*QBO_MONEY_CELL_CLASS|QBO_MONEY_CELL_CLASS[\s\S]*data-company-settlements-v3-panel="1"/,
  },
  // ROUND 443.274-C Settlements-PreSettlements.png — 6 KPI tiles + side-by-side Open | What closes.
  // Same listOpenPreSettlements / listSettlements KPI / getOpenDriverBills; chrome + board layout.
  {
    name: "SettlementsPreSettlementsKpiRow V3KpiTile strip (6 board tiles)",
    file: "apps/frontend/src/pages/drivers/SettlementsPreSettlementsKpiRow.tsx",
    pattern:
      /data-settlements-presettle-v3-kpis="1"[\s\S]*Total unpaid[\s\S]*This period[\s\S]*Driver pay \(period\)[\s\S]*Drivers w\/ debt[\s\S]*YTD settlements[\s\S]*Open driver bills/,
  },
  {
    name: "SettlementsPreSettlementsClosesPanel What closes a tour V3Panel",
    file: "apps/frontend/src/pages/drivers/SettlementsPreSettlementsKpiRow.tsx",
    pattern: /What closes a tour[\s\S]*V3Panel|V3Panel[\s\S]*What closes a tour|SettlementsPreSettlementsClosesPanel/,
  },
  {
    name: "PreSettlementsPanel V3Panel open list + board columns",
    file: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
    pattern:
      /data-settlements-presettle-v3-panel="1"[\s\S]*label: "Number"[\s\S]*label: "Loads so far"[\s\S]*label: "Pay so far"|label: "Number"[\s\S]*QBO_MONEY_CELL_CLASS[\s\S]*data-settlements-presettle-v3-panel="1"/,
  },
  {
    name: "Drivers.tsx mounts PreSettlements side-by-side board layout",
    file: "apps/frontend/src/pages/Drivers.tsx",
    pattern:
      /subnavTab === "pre_settlements"[\s\S]*SettlementsPreSettlementsKpiRow[\s\S]*settlements-presettle-v3-panels[\s\S]*PreSettlementsPanel[\s\S]*SettlementsPreSettlementsClosesPanel/,
  },
  // ROUND 443.274-C Settlements-Statement.dc.html — V3 identity strip + 2×2 board panels.
  // Same getSettlement / tour readout / SettlementKpiGrid (SETL-DETAIL-01); chrome only.
  {
    name: "SettlementDetailPage V3KpiTile statement identity strip",
    file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    pattern:
      /V3KpiTile[\s\S]*data-settlements-statement-v3-kpis="1"|data-settlements-statement-v3-kpis="1"[\s\S]*V3KpiTile/,
  },
  {
    name: "SettlementDetailPage Company settlement EntityLink on statement strip",
    file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    pattern:
      /data-settlements-statement-v3-kpis="1"[\s\S]*kind="company_settlement"|kind="company_settlement"[\s\S]*data-settlements-statement-v3-kpis="1"/,
  },
  {
    name: "SettlementDetailPage board action labels + SettlementStatementBoardPanels mount",
    file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    pattern:
      /Print statement[\s\S]*Download PDF[\s\S]*Open journal entry[\s\S]*SettlementStatementBoardPanels/,
  },
  {
    name: "SettlementStatementBoardPanels 4 V3Panel titles + data attr",
    file: "apps/frontend/src/pages/driver-finance/components/SettlementStatementBoardPanels.tsx",
    pattern:
      /data-settlements-statement-v3-panel="1"[\s\S]*Earnings — by load[\s\S]*Deductions · reimbursements · net[\s\S]*companyPanelTitle[\s\S]*Linked records/,
  },
  {
    name: "SettlementStatementBoardPanels company panel title includes side by side",
    file: "apps/frontend/src/pages/driver-finance/components/SettlementStatementBoardPanels.tsx",
    pattern: /side by side/,
  },
  {
    // ACCT-F5444: NOT kind="bill" — that was this check's original ask, and it is WRONG.
    // driver_finance.driver_bills is a different table from accounting.bills; kind="bill" drills
    // to /accounting/bills/:id, which live-404s for a driver_finance.driver_bills row (real repro,
    // verify-load-detail-driver-pay-bills.mjs's own comment: B-20260810-0003 -> 31f155f3-...).
    // These are OPEN (unsettled) bills — no settlement exists yet to reverse-link to either — so
    // driver + load are the only legitimate drills; the bill number itself stays honest plain text.
    //
    // Re-anchored (found live, 2026-09-01): OpenDriverBillsPanel was refactored to a DataTable +
    // openDriverBillColumns config (the EntityLink drills now live in the columns array, which is
    // defined ABOVE `function OpenDriverBillsPanel` in the file) — a legitimate change that left
    // the guard's driver/load JSX still fully correct, just textually before the old anchor instead
    // of after it, so `function OpenDriverBillsPanel[\s\S]*kind="driver"` could never match again.
    // Anchoring on `openDriverBillColumns` instead covers both the columns array and the panel
    // function (columns is always defined immediately before the panel that renders it).
    name: "SettlementsPage OpenDriverBillsPanel EntityLink drill (driver/load, never bill)",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    pattern: /(?:build[Oo]|o)penDriverBillColumns[\s\S]*kind="driver"[\s\S]*kind="load"/ /* LST-F421: renamed buildOpenDriverBillColumns (d1f9bae0d3) */,
    forbiddenNear: {
      // Forbid a REAL JSX kind="bill" prop near this function — not a prose mention of it in a
      // comment (which is exactly why this check exists and cites the live repro). Fixed-width
      // window, not a "match to closing brace" regex: OpenDriverBillsPanel's own destructured
      // props parameter list has its own `\n}` well before the function body even starts, so a
      // lazy [\s\S]*?\n} stops there instead of reaching the real body (found live: matched only
      // 86 chars, the props list, never the JSX). Window covers openDriverBillColumns (~1540
      // chars) through the end of OpenDriverBillsPanel (~2426 chars total, measured live) with
      // margin — wide enough for both blocks, not so wide it reaches unrelated later code.
      pattern: /(?:build[Oo]|o)penDriverBillColumns[\s\S]{0,2600}/,
      forbid: /<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/,
      message: 'must NOT EntityLink kind="bill" in OpenDriverBillsPanel — driver_finance.driver_bills has no /accounting/bills/:id row, this 404s live',
    },
  },
  {
    name: "SettlementsTable ParityTable storageKey (gear/column chrome)",
    file: "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx",
    pattern: /ParityTable[\s\S]*storageKey="driver-finance-settlements-list"/,
  },
  {
    name: "SettlementsPage scoped no-create EntityMultiSelect driver filter",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    filter: {kind:'driver',testId:'settlements-filter-driver'},
  },
  {
    name: "HoldDeductionModal DatePicker",
    file: "apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx",
    pattern: /DatePicker/,
  },
  {
    name: "SettlementStatementWorkflowPage MoneyInput",
    file: "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx",
    pattern: /MoneyInput/,
  },
  {
    name: "SettlementDisputesTab MoneyInput",
    file: "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx",
    pattern: /MoneyInput/,
  },
  {
    name: "chrome.toolbar_filter: SettlementsPage MoneyListToolbar payment_state MultiSelectDropdown",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    pattern:
      /MoneyListToolbar[\s\S]*testIdPrefix="settlements"[\s\S]*MultiSelectDropdown[\s\S]*label="Payment state"[\s\S]*options=\{PAYMENT_STATE_OPTIONS\}[\s\S]*selected=\{paymentStates\}/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (c.filter) fails.push(...multiSelectFilterProblems(src,{file:c.file,...c.filter}));
    else if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
    if (c.forbiddenNear) {
      const scope = c.forbiddenNear.pattern.exec(src)?.[0] ?? src;
      if (c.forbiddenNear.forbid.test(scope)) {
        fails.push(`${c.name}: ${c.forbiddenNear.message}`);
      }
    }
  }
  return fails;
}

function selftest() {
  selftestMultiSelectFilterContract();
  const live = runChecks();
  // GUARD-SELFTEST-LEAVES-UNTRACKED-DROPPINGS — this used to mkdtempSync inside the tracked
  // scripts/ tree; a killed/interrupted run left `scripts/.settlements-qbo-chrome-selftest-<rand>/`
  // as untracked git-status noise on every contributor's next commit (found live during a push
  // retry, same root-cause class as GUARD-SELFTEST-MUTATES-SOURCE — a selftest fixture belongs in
  // the real OS temp dir, never under the repo root, whether or not it's a tracked path).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "settlements-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);

    // Dedicated proof for the forbiddenNear check: poisoning the whole file (above) trivially
    // satisfies "no kind=bill JSX present" too, so that alone never exercises this detection path.
    // Plant a REAL kind="bill" regression on the live SettlementsPage.tsx content specifically.
    const settlementsFile = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
    const liveSrc = fs.readFileSync(path.join(ROOT, settlementsFile), "utf8");
    const regressed = liveSrc.replace(/kind="load"/, 'kind="bill"');
    if (regressed === liveSrc) {
      console.error(`${LABEL} SELFTEST FAIL — kind="load" anchor not found, re-anchor mutation`);
      process.exit(1);
    }
    // GUARD-SELFTEST-MUTATES-SOURCE — named tmpRegressedDir/tmpRegressedAbs (not regressedDir/
    // regressedAbs) specifically so verify-no-selftest-mutates-tracked-source.mjs's own "one hop
    // of tracing" temp-derivation check (TMP_NAME_HINT_RE = /tmp|temp|scratch/i on the VARIABLE
    // NAME) recognizes this write target as temp-rooted. It already is — tmp itself is
    // mkdtempSync(os.tmpdir(), ...)-derived — but the guard's heuristic lost the "temp" hint after
    // the regressed*/regressed* naming, textually matched settlementsFile's "apps/..." literal
    // instead, and flagged a false positive (confirmed: git status --short shows zero droppings
    // after this selftest runs, matching this file's other, already-safe writeFileSync calls).
    const tmpRegressedDir = path.join(tmp, "regressed");
    const tmpRegressedAbs = path.join(tmpRegressedDir, settlementsFile);
    fs.mkdirSync(path.dirname(tmpRegressedAbs), { recursive: true });
    fs.writeFileSync(tmpRegressedAbs, regressed);
    for (const c of CHECKS) {
      if (c.file === settlementsFile) continue;
      const abs = path.join(tmpRegressedDir, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(path.join(ROOT, c.file), abs);
    }
    const caughtRegression = runChecks(tmpRegressedDir).some((f) => f.includes('kind="bill"'));
    if (!caughtRegression) {
      console.error(`${LABEL} SELFTEST FAIL — planted kind="bill" regression in OpenDriverBillsPanel not caught`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (kind="bill" regression detected)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} settlements qbo_chrome leaf asserts`);
