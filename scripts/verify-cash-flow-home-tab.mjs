#!/usr/bin/env node
// REG-031 (owner live 2026-09-09): Cash Flow left-nav lands on Home first.
// ROUND 443.280-A #7: Home board ONLY — V3KpiTile strip (not layered CashFlowKpiStrip),
// no TAB_CARDS theater, category 13-week table + real monthly grain, sibling tabs reachable.
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
    // 443.280 — board KPI strip is V3KpiTile (CashFlowKpiStrip under it was LAYERED).
    if (!/<V3KpiTile\b/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: does not render <V3KpiTile> -- REG-022 / 443.280 require the board KPI strip`);
    }
    if (/<CashFlowKpiStrip\b/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: still renders layered <CashFlowKpiStrip> under the V3 board KPIs — 443.280 forbids layering`);
    }
    if (/\bTAB_CARDS\b/.test(homeSrc) || /cash-flow-home-tab-cards/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: TAB_CARDS theater still present — 443.280 Home board removes it (sibling tabs via KPI/links)`);
    }
    for (const tab of SIBLING_TABS) {
      if (!homeSrc.includes(`"${tab}"`) && !homeSrc.includes(`'${tab}'`)) {
        failures.push(`${HOME_TAB_REL}: does not link to sibling tab "${tab}" -- Home must make every tab reachable from there`);
      }
    }
    if (!/from ["']\.\.\/\.\.\/\.\.\/design\/v3-tokens["']/.test(homeSrc) && !/from ["'][^"']*design\/v3-tokens["']/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: missing v3-tokens import -- 443.250 requires the single design-system palette`);
    }
    for (const comp of ["V3KpiTile", "BoardSection", "V3Segmented"]) {
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
    if (!/buildMonthBuckets\b/.test(homeSrc) && !/Monthly/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: missing real Monthly roll-up — 443.280 requires calendar-month buckets, not every-4th-week sampling`);
    }
    if (!/Grey = run-rate|run-rate estimate/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: missing grey=run-rate / black=committed board footer law`);
    }
    if (!/Customer invoices due/.test(homeSrc) || !/Run-rate top-up/.test(homeSrc)) {
      failures.push(`${HOME_TAB_REL}: 13-week category rows missing (Customer invoices due / Run-rate top-up) — board incomplete`);
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
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { getRollingLedger } from "../../../api/cashFlow";
function buildMonthBuckets(weeks) { return weeks; }
getRollingLedger(oci, today, end);
onNavigateToTab("daily_prediction");
onNavigateToTab("actual_vs_projected");
onNavigateToTab("rolling_ledger");
onNavigateToTab("manual_daily_projections");
<div data-testid="cash-flow-home-v3-kpis"><V3KpiTile label="Opening" value="$1" /></div>
<BoardSection title="Cash position" testId="cash-flow-home-chart-panel"><div /></BoardSection>
<BoardSection title="13-week" testId="cash-flow-home-table-panel" footer="Grey = run-rate estimate · black = committed documents">
  <div data-testid="cash-flow-home-13w-table">Customer invoices due / Run-rate top-up</div>
</BoardSection>
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

  const layered = goodHome.replace(
    '<div data-testid="cash-flow-home-v3-kpis"><V3KpiTile label="Opening" value="$1" /></div>',
    '<CashFlowKpiStrip kpis={kpis} /><div data-testid="cash-flow-home-v3-kpis"><V3KpiTile label="Opening" value="$1" /></div>',
  );
  if (auditSources({ pageSrc: goodPage, homeSrc: layered, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: layered CashFlowKpiStrip went undetected");
  }

  const withTabCards = goodHome + '\nconst TAB_CARDS = [{ id: "daily_prediction" }];\n';
  if (auditSources({ pageSrc: goodPage, homeSrc: withTabCards, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: TAB_CARDS theater went undetected");
  }

  const homeMissingLink = goodHome.replace('onNavigateToTab("rolling_ledger");\n', "");
  if (auditSources({ pageSrc: goodPage, homeSrc: homeMissingLink, kpiStripSrc: goodKpiStrip, rollingLedgerSrc: goodRollingLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: Home tab missing a sibling-tab link went undetected");
  }

  console.log("verify-cash-flow-home-tab: SELFTEST PASS");
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
console.log("verify-cash-flow-home-tab: OK — Home board V3 KPIs (no layered strip/TAB_CARDS), category table + monthly, sibling tabs reachable");
