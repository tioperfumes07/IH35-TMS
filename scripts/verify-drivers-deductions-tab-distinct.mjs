#!/usr/bin/env node
/**
 * verify-drivers-deductions-tab-distinct — 0441-mod5-deductions-tab-wrong-content
 * UPDATED C-33 / Round 298.1: Deductions are a sub-ledger UNDER Settlements
 * (not a peer Drivers tab). Still must NOT share the Cash advances Debt Alert panel.
 *
 * ROUND 443.250 — also asserts Settlements-Deductions V3 KPI strip on
 * SettlementsDeductionsKpiRow (V3KpiTile + data-settlements-deductions-v3-kpis +
 * board labels). Piggyback EVEN step 1012; no new claim.
 *
 * Self-test: node scripts/verify-drivers-deductions-tab-distinct.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx");
const TABS = path.join(ROOT, "apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts");
const KPI_ROW = path.join(ROOT, "apps/frontend/src/pages/drivers/SettlementsDeductionsKpiRow.tsx");
const LABEL = "verify-drivers-deductions-tab-distinct";

/**
 * @param {string} source
 * @param {string} [tabsSource]
 * @returns {string[]}
 */
export function computeFailures(source, tabsSource = "") {
  const errors = [];

  if (/subnavTab\s*===\s*["']cash_advances["']\s*\|\|\s*subnavTab\s*===\s*["']deductions["']/.test(source)) {
    errors.push("Drivers.tsx must not OR cash_advances with deductions for the same panel");
  }
  if (/subnavTab\s*===\s*["']deductions["']\s*\|\|\s*subnavTab\s*===\s*["']cash_advances["']/.test(source)) {
    errors.push("Drivers.tsx must not OR deductions with cash_advances for the same panel");
  }

  if (!/subnavTab\s*===\s*["']cash_advances["']/.test(source)) {
    errors.push("Drivers.tsx must keep a cash_advances-only branch");
  }

  // C-33 — deductions live under Settlements, not as a peer tab.
  if (tabsSource && /id:\s*"deductions"/.test(tabsSource)) {
    errors.push("DRIVERS_SUBNAV must not list deductions as a peer tab (C-33 — under Settlements)");
  }
  if (!/subnavTab\s*===\s*["']settlements["']/.test(source)) {
    errors.push("Drivers.tsx must keep a settlements branch that hosts deductions");
  }

  if (!/AutoDeductionPoliciesPanel/.test(source)) {
    errors.push("Drivers.tsx settlements/deductions surface must render AutoDeductionPoliciesPanel");
  }
  if (!/data-testid=["']drivers-deductions-panel["']/.test(source)) {
    errors.push("Drivers.tsx must expose data-testid=drivers-deductions-panel under Settlements");
  }
  if (!/data-testid=["']drivers-cash-advances-debt-alert["']/.test(source)) {
    errors.push("Drivers.tsx must expose data-testid=drivers-cash-advances-debt-alert on the cash_advances branch");
  }

  // ROUND 443.250 — V3 board chrome mounts on the deductions surface only.
  if (!/SettlementsDeductionsKpiRow/.test(source)) {
    errors.push("Drivers.tsx must mount SettlementsDeductionsKpiRow on the deductions board (ROUND 443.250)");
  }
  if (!/isDeductionsBoard/.test(source)) {
    errors.push("Drivers.tsx must gate SettlementsDeductionsKpiRow behind isDeductionsBoard");
  }

  return errors;
}

/** ROUND 443.250 Settlements Deductions V3 board chrome. */
export function computeKpiV3Failures(source) {
  const errors = [];
  if (!source.includes("V3KpiTile")) {
    errors.push("SettlementsDeductionsKpiRow must render V3KpiTile (ROUND 443.250 Deductions V3)");
  }
  if (!source.includes("data-settlements-deductions-v3-kpis")) {
    errors.push("SettlementsDeductionsKpiRow must mark data-settlements-deductions-v3-kpis for the V3 board strip");
  }
  for (const label of [
    "Deductions this week",
    "Open liabilities",
    "Drivers w/ debt",
    "Scheduled deductions",
  ]) {
    if (!new RegExp(`label=["']${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source)) {
      errors.push(`SettlementsDeductionsKpiRow V3 strip must include board label "${label}"`);
    }
  }
  if (!source.includes("listSettlements")) {
    errors.push("SettlementsDeductionsKpiRow must keep listSettlements (Deductions this week engine)");
  }
  if (!source.includes("getActiveLiabilities")) {
    errors.push("SettlementsDeductionsKpiRow must keep getActiveLiabilities (Open liabilities count)");
  }
  if (!source.includes("getLiabilitiesKpis")) {
    errors.push("SettlementsDeductionsKpiRow must keep getLiabilitiesKpis (Drivers w/ debt)");
  }
  if (!source.includes("listAutoDeductionPolicies")) {
    errors.push("SettlementsDeductionsKpiRow must keep listAutoDeductionPolicies (Scheduled deductions)");
  }
  if (!source.includes("By type · this week")) {
    errors.push('SettlementsDeductionsKpiRow must render By type · this week panel');
  }
  return errors;
}

function selftest() {
  const good = `
    import { AutoDeductionPoliciesPanel } from "./drivers/AutoDeductionPolicies";
    import { SettlementsDeductionsKpiRow } from "./drivers/SettlementsDeductionsKpiRow";
    const isDeductionsBoard = true;
    {subnavTab === "cash_advances" ? (
      <div data-testid="drivers-cash-advances-debt-alert"><DataPanel title="Debt Alert" /></div>
    ) : null}
    {subnavTab === "settlements" ? (
      <div data-testid="drivers-deductions-panel">
        {isDeductionsBoard ? <SettlementsDeductionsKpiRow /> : null}
        <AutoDeductionPoliciesPanel />
      </div>
    ) : null}
  `;
  const goodTabs = `export const DRIVERS_SUBNAV = [{ id: "settlements" }, { id: "cash_advances" }];`;
  const badShared = `
    {subnavTab === "cash_advances" || subnavTab === "deductions" ? (
      <DataPanel title="Debt Alert · before any payment" />
    ) : null}
  `;
  const badPeerTabs = `export const DRIVERS_SUBNAV = [{ id: "deductions" }];`;
  let ok = true;
  for (const c of [
    { name: "distinct under settlements", input: good, tabs: goodTabs, expectPass: true },
    { name: "shared OR condition", input: badShared, tabs: goodTabs, expectPass: false },
    { name: "peer deductions tab", input: good, tabs: badPeerTabs, expectPass: false },
  ]) {
    const failures = computeFailures(c.input, c.tabs);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${JSON.stringify(failures)}`);
    } else {
      console.log(`selftest ok — ${c.name}`);
    }
  }
  const goodKpi = `
    import { V3KpiTile } from "../../components/v3/V3KpiTile";
    import { listSettlements } from "../../api/driverFinance";
    import { getActiveLiabilities, getLiabilitiesKpis } from "../../api/liabilities";
    import { listAutoDeductionPolicies } from "../../hooks/useAutoDeductionPolicies";
    <div data-settlements-deductions-v3-kpis="1">
      <V3KpiTile label="Deductions this week" value="$1" />
      <V3KpiTile label="Open liabilities" value="0" />
      <V3KpiTile label="Drivers w/ debt" value="0" />
      <V3KpiTile label="Scheduled deductions" value="1" />
    </div>
    <span>By type · this week</span>
  `;
  if (computeKpiV3Failures(goodKpi).length) {
    ok = false;
    console.error(`SELFTEST FAIL — good kpi: ${JSON.stringify(computeKpiV3Failures(goodKpi))}`);
  } else {
    console.log("selftest ok — deductions v3 kpi");
  }
  const stripped = goodKpi
    .replace(/V3KpiTile/g, "LegacyKpi")
    .replace(/data-settlements-deductions-v3-kpis/g, "data-deductions-legacy");
  if (!computeKpiV3Failures(stripped).length) {
    ok = false;
    console.error("SELFTEST FAIL — V3 strip removal should fail kpiV3Failures");
  } else {
    console.log("selftest ok — deductions v3 kpi mutation");
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(PAGE, "utf8");
  const tabsSource = fs.readFileSync(TABS, "utf8");
  const failures = computeFailures(source, tabsSource);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  if (!fs.existsSync(KPI_ROW)) {
    console.error(`[${LABEL}] FAIL: missing ${KPI_ROW}`);
    process.exit(1);
  }
  const kpiSource = fs.readFileSync(KPI_ROW, "utf8");
  const kpiFailures = computeKpiV3Failures(kpiSource);
  if (kpiFailures.length) {
    console.error(`[${LABEL}] FAIL (V3 KPI):`);
    for (const f of kpiFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Drivers deductions under Settlements, distinct from cash advances; V3 KPIs present`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
