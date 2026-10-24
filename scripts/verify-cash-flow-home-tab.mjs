#!/usr/bin/env node
// REG-031 (owner live 2026-09-09, verbatim: "clicking Cash Flow in the left nav must land on a
// Cash Flow Home page first, with tabs used FROM there — not straight into a tab"). Before this
// fix, CashFlowPage.tsx's parseCashFlowTab() defaulted a missing/unrecognized ?tab= straight to
// "daily_prediction" -- exactly the REG-022 FAIL pattern already recorded for Driver Finance/
// Settlements and Vendors/Customers (landing directly on functional content, no Home tab, no KPI
// tile strip). MaintenanceHome.tsx is the owner-named REG-022 reference: module name at top +
// real KPI tile strip on the landing surface.
//
// STATIC (always runs, no DB/browser needed): asserts, by reading the real source files —
//   1. CashFlowPage.tsx's default-tab fallback is "home", not "daily_prediction".
//   2. "home" is a real, first-position tab in both the type union and the TABS array (not just a
//      silent fallback with no visible entry point back to it).
//   3. CashFlowHomeTab.tsx exists, renders the shared KPI strip, and links into every sibling tab
//      (daily_prediction / actual_vs_projected / rolling_ledger / manual_daily_projections) --
//      "tabs reachable from there," not a dead end.
//   4. RollingLedgerTab.tsx reuses the SAME shared CashFlowKpiStrip component rather than a second,
//      independently-drifting inline copy of the tile markup.
//   5. ROUND 443.250 — Home also mounts the shared V3 design-system pieces (V3KpiTile / V3Panel /
//      V3Segmented from components/v3 + v3-tokens) and the chart + 13-week table panels.
import fs from "node:fs";
import path from "node:path";

const ROOT_PAGE_REL = "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx";
const HOME_TAB_REL = "apps/frontend/src/pages/cash-flow/tabs/CashFlowHomeTab.tsx";
const KPI_STRIP_REL = "apps/frontend/src/pages/cash-flow/tabs/CashFlowKpiStrip.tsx";
const ROLLING_LEDGER_REL = "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx";

const SIBLING_TABS = ["daily_prediction", "actual_vs_projected", "rolling_ledger", "manual_daily_projections"];

export function auditSources({ pageSrc, homeSrc, kpiStripSrc, rollingLedgerSrc }) {
  const failures = [];

  if (!/return\s+"home";\s*\n}/.test(pageSrc) && !/return "home";/.test(pageSrc)) {
    failures.push(`${ROOT_PAGE_REL}: parseCashFlowTab's default fallback is not "home" -- landing would still drop straight into a functional tab`);
  }
  if (!/\{\s*id:\s*"home"/.test(pageSrc)) {
    failures.push(`${ROOT_PAGE_REL}: no "home" entry in the TABS array -- Home would be unreachable as a visible tab`);
  }
  if (!/CashFlowHomeTab/.test(pageSrc)) {
    failures.push(`${ROOT_PAGE_REL}: does not render CashFlowHomeTab -- the home tab id exists but nothing renders for it`);
  }

  if (homeSrc === null) {
    failures.push(`${HOME_TAB_REL}: missing`);
  } else {
    if (!/<CashFlowKpiStrip\b/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: does not render <CashFlowKpiStrip> -- REG-022 requires a real KPI tile strip on the landing surface`);
    }
    for (const tab of SIBLING_TABS) {
      if (!homeSrc.includes(`"${tab}"`)) {
        failures.push(`${HOME_TAB_REL}: does not link to sibling tab "${tab}" -- Home must make every tab reachable from there`);
      }
    }
    // 443.250 V3 board slice — shared design system + chart/table surfaces on Home.
    if (!/from ["']\.\.\/\.\.\/\.\.\/design\/v3-tokens["']/.test(homeSrc) && !/from ["'][^"']*design\/v3-tokens["']/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: missing v3-tokens import -- 443.250 requires the single design-system palette`);
    }
    for (const comp of ["V3KpiTile", "V3Panel", "V3Segmented"]) {
      if (!new RegExp(`<${comp}\\b`).test(homeSrc)) {
        failures.push(`${HOME_TAB_REL}: does not render <${comp}> -- 443.250 Cash Flow Home V3 board requires shared components/v3`);
      }
    }
    for (const testId of ["cash-flow-home-v3-kpis", "cash-flow-home-chart-panel", "cash-flow-home-table-panel", "cash-flow-home-13w-table"]) {
      if (!homeSrc.includes(testId)) {
        failures.push(`${HOME_TAB_REL}: missing data-testid "${testId}" -- 443.250 Home V3 surfaces must stay measurable`);
      }
    }
    if (!/getRollingLedger\b/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: no longer calls getRollingLedger -- V3 Home numbers must stay on the live ledger endpoint`);
    }
  }

  if (kpiStripSrc === null) {
    failures.push(`${KPI_STRIP_REL}: missing`);
  }

  if (rollingLedgerSrc === null) {
    failures.push(`${ROLLING_LEDGER_REL}: missing`);
  } else if (!/<CashFlowKpiStrip\b/.test(rollingLedgerSrc)) {
    failures.push(`${ROLLING_LEDGER_REL}: no longer renders the shared <CashFlowKpiStrip> -- a second, independently-drifting KPI tile copy may have been reintroduced`);
  }

  return failures;
}

function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const goodPage = `
function parseCashFlowTab(raw, allowManual) {
  return "home";
}
const TABS = [
  { id: "home", label: "Home" },
  { id: "daily_prediction", label: "Projected (Auto)" },
];
<CashFlowHomeTab operatingCompanyId={x} />
`;
  const goodHome = `
import { V3 } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { CashFlowKpiStrip } from "./CashFlowKpiStrip";
import { getRollingLedger } from "../../../api/cashFlow";
const TAB_CARDS = [
  { id: "daily_prediction" },
  { id: "actual_vs_projected" },
  { id: "rolling_ledger" },
  { id: "manual_daily_projections" },
];
getRollingLedger(oci, today, end);
<CashFlowKpiStrip kpis={kpis} />
<div data-testid="cash-flow-home-v3-kpis"><V3KpiTile label="Opening" value="$1" /></div>
<V3Panel title="Cash position" testId="cash-flow-home-chart-panel"><div /></V3Panel>
<V3Panel title="13-week" testId="cash-flow-home-table-panel"><div data-testid="cash-flow-home-13w-table" /></V3Panel>
<V3Segmented value="weekly" options={[]} onChange={() => {}} />
`;
  const goodKpiStrip = "export function CashFlowKpiStrip() {}";
  const goodRollingLedger = 'import { CashFlowKpiStrip } from "./CashFlowKpiStrip";\n<CashFlowKpiStrip kpis={kpis} />';

  const pass = auditSources({ pageSrc: goodPage, homeSrc: goodHome, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger });
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const badDefault = goodPage.replace('return "home";', 'return "daily_prediction";');
  if (auditSources({ pageSrc: badDefault, homeSrc: goodHome, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: reverted default-tab fallback went undetected");
  }

  const badNoTabEntry = goodPage.replace('{ id: "home", label: "Home" },\n', "");
  if (auditSources({ pageSrc: badNoTabEntry, homeSrc: goodHome, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: missing Home tab-list entry went undetected");
  }

  const homeNoKpi = goodHome.replace("<CashFlowKpiStrip kpis={kpis} />", "");
  if (auditSources({ pageSrc: goodPage, homeSrc: homeNoKpi, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: Home tab missing the KPI strip went undetected");
  }

  const homeMissingLink = goodHome.replace('{ id: "rolling_ledger" },\n', "");
  if (auditSources({ pageSrc: goodPage, homeSrc: homeMissingLink, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: Home tab missing a sibling-tab link went undetected");
  }

  const rollingLedgerReverted = 'const kpisMarkup = "<div>60px inline tile markup duplicated here again</div>";';
  if (auditSources({ pageSrc: goodPage, homeSrc: goodHome, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: rollingLedgerReverted }).length === 0) {
    throw new Error("SELFTEST FAIL: RollingLedgerTab reverting to a duplicated inline KPI block went undetected");
  }

  const homeNoV3 = goodHome.replace(/<V3KpiTile[\s\S]*?\/>/, "");
  if (auditSources({ pageSrc: goodPage, homeSrc: homeNoV3, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: Home missing V3KpiTile went undetected");
  }

  console.log("verify-cash-flow-home-tab: SELFTEST PASS (6/6)");
  process.exit(0);
}

const root = process.cwd();
const failures = auditSources({
  pageSrc: readOrNull(root, ROOT_PAGE_REL) ?? "",
  homeSrc: readOrNull(root, HOME_TAB_REL),
  kpiStripSrc: readOrNull(root, KPI_STRIP_REL),
  rollingLedgerSrc: readOrNull(root, ROLLING_LEDGER_REL),
});
if (failures.length) {
  console.error("verify-cash-flow-home-tab FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cash-flow-home-tab: OK — Cash Flow lands on Home first, Home shows KPI strip + 443.250 V3 chart/table (shared components/v3), RollingLedgerTab shares the same KPI component");
