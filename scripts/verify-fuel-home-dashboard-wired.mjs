#!/usr/bin/env node
/**
 * verify-fuel-home-dashboard-wired.mjs — f-01-fuel-home-stub
 *
 * FuelHome.tsx must call GET /api/v1/fuel/planner/dashboard (via getFuelDashboard)
 * and render mtd_spend + fleet_mpg (via FuelKpiRow or inline).
 *
 * Self-test: node scripts/verify-fuel-home-dashboard-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/fuel/FuelHome.tsx");
const KPI = path.join(ROOT, "apps/frontend/src/pages/fuel/components/FuelKpiRow.tsx");
const CARDS = path.join(ROOT, "apps/frontend/src/pages/fuel/cards/FuelCardsPage.tsx");
const UNMATCHED = path.join(ROOT, "apps/frontend/src/pages/fuel/relay-unmatched/RelayUnmatchedPage.tsx");
const WALLET = path.join(ROOT, "apps/frontend/src/pages/fuel/relay-wallet/RelayWalletRollForwardPage.tsx");
const FUEL_PLANNER_HOME = path.join(ROOT, "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx");
const PLANNER = path.join(ROOT, "apps/backend/src/fuel/planner.routes.ts");
const LABEL = "verify-fuel-home-dashboard-wired";
const SPEND_FAKE_ZERO_RE =
  /FROM fuel\.fuel_transactions[\s\S]{0,400}\.catch\(\(\) => \(\{ rows: \[\{ spend: 0, avg_price: 0 \}\] \}\)\)/;
const SEND_TO_DRIVER_DB_ERROR_AS_404_RE =
  /FROM fuel\.route_recommendations[\s\S]{0,450}\.catch\(\(\) => \(\{ rows: \[\]/;
const DETAIL_FALSE_EMPTY_RE =
  /FROM fuel\.recommended_stops[\s\S]{0,500}\.catch\(\(\) => \(\{ rows: \[\]|recommendFuelStopsForRecommendation\([\s\S]{0,250}\.catch\(\(\) => \[\]\)/;

/**
 * @param {string} source
 * @returns {string[]}
 */
export function computePlannerFailures(plannerSource) {
  const errors = [];
  if (SPEND_FAKE_ZERO_RE.test(plannerSource)) {
    errors.push(
      "planner.routes.ts must not coerce a failed fuel.fuel_transactions spend query to { spend: 0, avg_price: 0 }",
    );
  }
  if (!/FROM fuel\.fuel_transactions/.test(plannerSource)) {
    errors.push("planner.routes.ts must keep the MTD spend query on fuel.fuel_transactions");
  }
  if (SEND_TO_DRIVER_DB_ERROR_AS_404_RE.test(plannerSource)) {
    errors.push(
      "planner.routes.ts send-to-driver must not catch a route_recommendations query failure as empty rows (that becomes a fake 404)",
    );
  }
  if (DETAIL_FALSE_EMPTY_RE.test(plannerSource)) {
    errors.push("planner.routes.ts detail stop/HOS query failures must propagate instead of rendering empty recommendations");
  }
  return errors;
}

export function computeFailures(source) {
  const errors = [];
  if (!/getFuelDashboard/.test(source) && !/\/api\/v1\/fuel\/planner\/dashboard/.test(source)) {
    errors.push("FuelHome.tsx must fetch getFuelDashboard or /api/v1/fuel/planner/dashboard");
  }
  if (!/FuelKpiRow/.test(source) && !/mtd_spend/.test(source)) {
    errors.push("FuelHome.tsx must render FuelKpiRow or mtd_spend");
  }
  if (!/FuelKpiRow/.test(source) && !/fleet_mpg/.test(source)) {
    errors.push("FuelHome.tsx must render FuelKpiRow or fleet_mpg");
  }
  if (!/FuelFraudAlertsKpiCard/.test(source) || !/RelayHistoryImport/.test(source)) {
    errors.push("FuelHome.tsx must keep FuelFraudAlertsKpiCard + RelayHistoryImport (additive-only)");
  }
  // ROUND 443.326 — full board: FuelKpiRow + diesel ParityTable (not metric-as-rows / V3Panel stack).
  if (!/ParityTable/.test(source) || !/MoneyListToolbar/.test(source)) {
    errors.push("FuelHome.tsx must mount MoneyListToolbar + ParityTable (443.326 board grammar)");
  }
  if (!/Diesel by truck/.test(source) && !/fetchDieselByTruckAggregate/.test(source)) {
    errors.push("FuelHome.tsx must roster diesel-by-truck from the same aggregate engine");
  }
  if (/FuelMetricRow|Dashboard metrics/.test(source)) {
    errors.push("FuelHome.tsx must not keep metric-as-rows ParityTable theater");
  }
  if (/<V3Panel\b/.test(source)) {
    errors.push("FuelHome.tsx must not wrap the board in V3Panel (443.326 unwrap)");
  }
  if (!/to="\/fuel\/by-truck"/.test(source) && !/viewAllHref="\/fuel\/by-truck"/.test(source)) {
    errors.push("FuelHome.tsx must link diesel View all to /fuel/by-truck");
  }
  if (!/lovesSyncQuery\.isError[\s\S]{0,240}<ListErrorBanner[\s\S]{0,180}lovesSyncQuery\.refetch\(\)/.test(source)) {
    errors.push("FuelHome.tsx must disclose Love's sync-status failure and retry the exact query");
  }
  // BANK-F91284 leftover refuse — FuelHome page-scoped text token ratchet
  if (source.includes("text-[11px]")) errors.push("FuelHome.tsx: leftover text-[11px]");
  if (source.includes("#8A92AB") || source.includes("#334155")) errors.push("FuelHome.tsx: leftover off-scale muted");
  return errors;
}

export function computeKpiFailures(source) {
  const errors = [];
  if (!/dashboard === undefined \|\| lovesSyncStatus === undefined\) return null/.test(source)) {
    errors.push("FuelKpiRow must not assert Never until both authoritative sync feeds resolve");
  }
  // ROUND 443.250 — V3 board chrome (Fuel.dc.html); engine unchanged
  if (!/V3KpiTile/.test(source)) {
    errors.push("FuelKpiRow must render V3KpiTile (ROUND 443.250 Fuel home V3)");
  }
  if (!/data-fuel-v3-kpis/.test(source)) {
    errors.push("FuelKpiRow must mark data-fuel-v3-kpis for the V3 board strip");
  }
  if (/DrillKpiCard/.test(source)) {
    errors.push("FuelKpiRow must not keep DrillKpiCard after V3 restyle");
  }
  return errors;
}

/** ROUND 443.282 — Fuel.dc.html board shell (7-tab navy subnav + header actions). */
export function computeBoardShellFailures(source) {
  const errors = [];
  if (!/subtitle=\{FUEL_BOARD_SUBTITLE\}/.test(source)) {
    errors.push("FuelPlannerHome must use FUEL_BOARD_SUBTITLE (443.282 board header)");
  }
  if (!/FUEL_BOARD_SUBNAV\.map/.test(source)) {
    errors.push("FuelPlannerHome must render FUEL_BOARD_SUBNAV (board tabs)");
  }
  if (!/fuel-board-header-import-fills/.test(source) || !/fuel-board-header-add-fill/.test(source)) {
    errors.push("FuelPlannerHome must expose Import fills + Add fill header actions");
  }
  if (!/RelatedModuleLinks/.test(source) || !/fuel-related-module-links/.test(source)) {
    errors.push("FuelPlannerHome must render RelatedModuleLinks for off-board fuel tabs");
  }
  if (!/tab === "by_truck"/.test(source) || !/FuelDieselByTruckPanel/.test(source)) {
    errors.push("FuelPlannerHome must wire by_truck tab with FuelBoardKpiStrip + FuelDieselByTruckPanel");
  }
  if (/initialTab = "planner"/.test(source)) {
    errors.push("FuelPlannerHome default initialTab must be home (443.282 board landing)");
  }
  return errors;
}

/** ROUND 443.250 Fuel Cards tab — V3 board chrome; listFuelCardAssignments engine unchanged. */
export function computeCardsFailures(source) {
  const errors = [];
  if (!/V3KpiTile/.test(source) || !/data-fuel-cards-v3-kpis/.test(source)) {
    errors.push("FuelCardsPage must render V3KpiTile strip with data-fuel-cards-v3-kpis");
  }
  if (!/FuelBoardSection/.test(source) || !/fuel-cards-registry-v3-panel/.test(source) || !/fuel-cards-issuers-v3-panel/.test(source)) {
    errors.push("FuelCardsPage must wrap Card issuers + Fuel card -> truck registry in FuelBoardSection");
  }
  if (/import\s*\{[^}]*\bV3Panel\b/.test(source) || /<\s*V3Panel\b/.test(source)) {
    errors.push("FuelCardsPage must not use V3Panel after 443.326 unwrap");
  }
  if (!/MoneyListToolbar/.test(source)) {
    errors.push("FuelCardsPage must mount MoneyListToolbar (443.326 board grammar)");
  }
  if (/DataPanel/.test(source)) {
    errors.push("FuelCardsPage must not keep DataPanel after V3 restyle");
  }
  if (!/listFuelCardAssignments/.test(source)) {
    errors.push("FuelCardsPage must keep listFuelCardAssignments (engine unchanged)");
  }
  for (const label of ["Active", "Ended", "Voided", "Assignments", "Card issuers", "Fuel card -> truck registry", "+ Assign card", "Show voided"]) {
    if (!source.includes(label)) {
      errors.push(`FuelCardsPage must keep board label "${label}"`);
    }
  }
  return errors;
}

/** ROUND 443.250 Relay Unmatched tab — V3 board chrome; listRelayFills engine unchanged. */
export function computeUnmatchedFailures(source) {
  const errors = [];
  if (!/V3KpiTile/.test(source) || !/data-relay-unmatched-v3-kpis/.test(source)) {
    errors.push("RelayUnmatchedPage must render V3KpiTile strip with data-relay-unmatched-v3-kpis");
  }
  if (!/FuelBoardSection/.test(source) || !/relay-unmatched-v3-panel/.test(source)) {
    errors.push("RelayUnmatchedPage must wrap the unmatched table in FuelBoardSection (relay-unmatched-v3-panel)");
  }
  if (/import\s*\{[^}]*\bV3Panel\b/.test(source) || /<\s*V3Panel\b/.test(source)) {
    errors.push("RelayUnmatchedPage must not use V3Panel after 443.326 unwrap");
  }
  if (!/MoneyListToolbar/.test(source)) {
    errors.push("RelayUnmatchedPage must mount MoneyListToolbar (443.326 board grammar)");
  }
  if (/import\s*\{[^}]*\bDataPanel\b/.test(source) || /<\s*DataPanel\b/.test(source)) {
    errors.push("RelayUnmatchedPage must not keep DataPanel after V3 restyle");
  }
  if (!/listRelayFills/.test(source) || !/unmatched:\s*true/.test(source)) {
    errors.push("RelayUnmatchedPage must keep listRelayFills({ unmatched: true }) (engine unchanged)");
  }
  for (const label of ["Unmatched", "This page", "Page size", "Relay fills — unmatched"]) {
    if (!source.includes(label)) {
      errors.push(`RelayUnmatchedPage must keep board label "${label}"`);
    }
  }
  return errors;
}

/** ROUND 443.250 Relay Wallet tab — V3 board chrome; getRelayWalletRollForward engine unchanged. */
export function computeWalletFailures(source) {
  const errors = [];
  if (!/V3KpiTile/.test(source) || !/data-relay-wallet-v3-kpis/.test(source)) {
    errors.push("RelayWalletRollForwardPage must render V3KpiTile strip with data-relay-wallet-v3-kpis");
  }
  if (
    !/FuelBoardSection/.test(source) ||
    !/relay-wallet-roll-forward-v3-panel/.test(source) ||
    !/relay-wallet-docs-v3-panel/.test(source)
  ) {
    errors.push("RelayWalletRollForwardPage must wrap roll-forward + docs drill in FuelBoardSection");
  }
  if (/import\s*\{[^}]*\bV3Panel\b/.test(source) || /<\s*V3Panel\b/.test(source)) {
    errors.push("RelayWalletRollForwardPage must not use V3Panel after 443.326 unwrap");
  }
  if (!/MoneyListToolbar/.test(source)) {
    errors.push("RelayWalletRollForwardPage must mount MoneyListToolbar (443.326 board grammar)");
  }
  if (/import\s*\{[^}]*\bDataPanel\b/.test(source) || /<\s*DataPanel\b/.test(source)) {
    errors.push("RelayWalletRollForwardPage must not keep DataPanel after V3 restyle");
  }
  if (!/getRelayWalletRollForward/.test(source)) {
    errors.push("RelayWalletRollForwardPage must keep getRelayWalletRollForward (engine unchanged)");
  }
  for (const label of [
    "Deposits",
    "Fuel fills",
    "Fill fees",
    "Lumper",
    "Balance",
    "Deposit fees (card)",
    "Relay wallet — roll-forward",
  ]) {
    if (!source.includes(label)) {
      errors.push(`RelayWalletRollForwardPage must keep board label "${label}"`);
    }
  }
  return errors;
}

function selftest() {
  const plannerGood = `
      const spendRes = await client.query(\`SELECT COALESCE(sum(total_cost), 0)::numeric AS spend FROM fuel.fuel_transactions\`);
  `;
  const plannerBad = `
      FROM fuel.fuel_transactions
          WHERE operating_company_id = $1::uuid
      ).catch(() => ({ rows: [{ spend: 0, avg_price: 0 }] }));
  `;
  const plannerGoodFails = computePlannerFailures(plannerGood);
  if (plannerGoodFails.length) {
    console.error(`SELFTEST FAIL — planner good: ${JSON.stringify(plannerGoodFails)}`);
    process.exit(1);
  }
  const plannerBadFails = computePlannerFailures(plannerBad);
  if (!plannerBadFails.length) {
    console.error("SELFTEST FAIL — planner fake-zero catch should fail");
    process.exit(1);
  }
  console.log("selftest ok — planner spend fail-loud");
  const sendCatchBad = `
          FROM fuel.route_recommendations
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        \`,
        [params.data.id, companyId]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  `;
  if (!computePlannerFailures(sendCatchBad).some((e) => e.includes("fake 404"))) {
    console.error("SELFTEST FAIL — send-to-driver catch-as-empty should fail");
    process.exit(1);
  }
  if (computePlannerFailures(plannerGood).some((e) => e.includes("fake 404"))) {
    console.error("SELFTEST FAIL — spend-only planner source must not trip send-to-driver catch");
    process.exit(1);
  }
  console.log("selftest ok — send-to-driver fail-loud");
  const detailCatchBad = `${plannerGood}
    FROM fuel.recommended_stops WHERE recommendation_id = $1
    ).catch(() => ({ rows: [] }));
    recommendFuelStopsForRecommendation(client, input).catch(() => []);
  `;
  if (!computePlannerFailures(detailCatchBad).some((e) => e.includes("stop/HOS"))) {
    console.error("SELFTEST FAIL — planner detail catch-as-empty should fail");
    process.exit(1);
  }
  console.log("selftest ok — planner detail fail-loud");
  const kpiSource = fs.readFileSync(KPI, "utf8");
  if (computeKpiFailures(kpiSource).length) {
    console.error("SELFTEST FAIL — shipped Fuel KPI sync honesty baseline is red");
    process.exit(1);
  }
  const kpiMutant = kpiSource.replace("if (dashboard === undefined || lovesSyncStatus === undefined) return null;", 'return "Never";');
  if (kpiMutant === kpiSource || computeKpiFailures(kpiMutant).length === 0) {
    console.error("SELFTEST FAIL — false Never sync mutation escaped");
    process.exit(1);
  }
  console.log("selftest ok — unresolved Love's sync cannot assert Never");
  const v3Stripped = kpiSource.replace(/V3KpiTile/g, "LegacyKpi").replace(/data-fuel-v3-kpis/g, "data-fuel-legacy");
  if (!computeKpiFailures(v3Stripped).some((e) => e.includes("V3KpiTile"))) {
    console.error("SELFTEST FAIL — V3KpiTile removal should fail");
    process.exit(1);
  }
  const drillBack = `${kpiSource}\nimport { DrillKpiCard } from "x";\n`;
  if (!computeKpiFailures(drillBack).some((e) => e.includes("DrillKpiCard"))) {
    console.error("SELFTEST FAIL — DrillKpiCard reintro should fail");
    process.exit(1);
  }
  console.log("selftest ok — Fuel home V3 chrome markers");
  const cardsGood = fs.readFileSync(CARDS, "utf8");
  if (computeCardsFailures(cardsGood).length) {
    console.error("SELFTEST FAIL — shipped Fuel Cards V3 baseline is red", computeCardsFailures(cardsGood));
    process.exit(1);
  }
  const cardsNoV3 = cardsGood.replace(/V3KpiTile/g, "LegacyKpi").replace(/data-fuel-cards-v3-kpis/g, "data-fuel-cards-legacy");
  if (!computeCardsFailures(cardsNoV3).some((e) => e.includes("data-fuel-cards-v3-kpis"))) {
    console.error("SELFTEST FAIL — Fuel Cards V3KpiTile removal should fail");
    process.exit(1);
  }
  const cardsDataPanel = `${cardsGood}\nimport { DataPanel } from "x";\n`;
  if (!computeCardsFailures(cardsDataPanel).some((e) => e.includes("DataPanel"))) {
    console.error("SELFTEST FAIL — DataPanel reintro should fail");
    process.exit(1);
  }
  console.log("selftest ok — Fuel Cards V3 chrome markers");
  const unmatchedGood = fs.readFileSync(UNMATCHED, "utf8");
  if (computeUnmatchedFailures(unmatchedGood).length) {
    console.error("SELFTEST FAIL — shipped Relay Unmatched V3 baseline is red", computeUnmatchedFailures(unmatchedGood));
    process.exit(1);
  }
  const unmatchedNoV3 = unmatchedGood
    .replace(/V3KpiTile/g, "LegacyKpi")
    .replace(/data-relay-unmatched-v3-kpis/g, "data-relay-unmatched-legacy");
  if (!computeUnmatchedFailures(unmatchedNoV3).some((e) => e.includes("data-relay-unmatched-v3-kpis"))) {
    console.error("SELFTEST FAIL — Relay Unmatched V3KpiTile removal should fail");
    process.exit(1);
  }
  const unmatchedDataPanel = `${unmatchedGood}\nimport { DataPanel } from "x";\n`;
  if (!computeUnmatchedFailures(unmatchedDataPanel).some((e) => e.includes("DataPanel"))) {
    console.error("SELFTEST FAIL — Relay Unmatched DataPanel reintro should fail");
    process.exit(1);
  }
  console.log("selftest ok — Relay Unmatched V3 chrome markers");
  const walletGood = fs.readFileSync(WALLET, "utf8");
  if (computeWalletFailures(walletGood).length) {
    console.error("SELFTEST FAIL — shipped Relay Wallet V3 baseline is red", computeWalletFailures(walletGood));
    process.exit(1);
  }
  const walletNoV3 = walletGood
    .replace(/V3KpiTile/g, "LegacyKpi")
    .replace(/data-relay-wallet-v3-kpis/g, "data-relay-wallet-legacy");
  if (!computeWalletFailures(walletNoV3).some((e) => e.includes("data-relay-wallet-v3-kpis"))) {
    console.error("SELFTEST FAIL — Relay Wallet V3KpiTile removal should fail");
    process.exit(1);
  }
  const walletDataPanel = `${walletGood}\nimport { DataPanel } from "x";\n`;
  if (!computeWalletFailures(walletDataPanel).some((e) => e.includes("DataPanel"))) {
    console.error("SELFTEST FAIL — Relay Wallet DataPanel reintro should fail");
    process.exit(1);
  }
  console.log("selftest ok — Relay Wallet V3 chrome markers");
  const plannerHomeGood = fs.readFileSync(FUEL_PLANNER_HOME, "utf8");
  if (computeBoardShellFailures(plannerHomeGood).length) {
    console.error("SELFTEST FAIL — shipped Fuel board shell baseline is red", computeBoardShellFailures(plannerHomeGood));
    process.exit(1);
  }
  const plannerHomeBad = plannerHomeGood.replace(/subtitle=\{FUEL_BOARD_SUBTITLE\}/, "subtitle={activeLabel}");
  if (!computeBoardShellFailures(plannerHomeBad).some((e) => e.includes("FUEL_BOARD_SUBTITLE"))) {
    console.error("SELFTEST FAIL — board subtitle removal should fail board shell guard");
    process.exit(1);
  }
  console.log("selftest ok — Fuel 443.282 board shell markers");
  const good = `
    import { getFuelDashboard } from "../../api/fuelPlanner";
    import { FuelKpiRow } from "./components/FuelKpiRow";
    import { ParityTable } from "../../components/parity/ParityTable";
    import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
    import { RelayHistoryImport } from "./components/RelayHistoryImport";
    import { fetchDieselByTruckAggregate } from "./fuelDieselByTruck";
    export function FuelFraudAlertsKpiCard() {}
    export function FuelHomePage() {
      getFuelDashboard(id);
      fetchDieselByTruckAggregate(id);
      return <>{lovesSyncQuery.isError ? <ListErrorBanner onRetry={() => void lovesSyncQuery.refetch()} /> : null}<FuelKpiRow /><MoneyListToolbar /><ParityTable title="Diesel by truck" /><Link to="/fuel/by-truck" /><FuelFraudAlertsKpiCard /><RelayHistoryImport /></>;
    }
  `;
  const bad = `
    export function FuelFraudAlertsKpiCard() {}
    export function FuelHomePage() {
      return <><FuelFraudAlertsKpiCard /><RelayHistoryImport /></>;
    }
  `;
  let ok = true;
  for (const c of [
    { name: "wired", input: good, expectPass: true },
    { name: "stub only", input: bad, expectPass: false },
  ]) {
    const failures = computeFailures(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${JSON.stringify(failures)}`);
    } else console.log(`selftest ok — ${c.name}`);
  }
  const retryNoOp = good.replace("lovesSyncQuery.refetch()", "undefined");
  if (!computeFailures(retryNoOp).some((failure) => failure.includes("sync-status failure"))) {
    console.error("SELFTEST FAIL — Love's sync-status retry no-op should fail");
    process.exit(1);
  }
  if (!ok) process.exit(1);
  const leftover = computeFailures(
    `getFuelDashboard FuelKpiRow FuelFraudAlertsKpiCard RelayHistoryImport MoneyListToolbar ParityTable Diesel by truck fetchDieselByTruckAggregate to="/fuel/by-truck" lovesSyncQuery.isError <ListErrorBanner lovesSyncQuery.refetch()\n<div className="text-[11px] text-[#8A92AB]">plant</div>`,
  );
  if (!leftover.some((e) => e.includes("leftover text-[11px]")) || !leftover.some((e) => e.includes("leftover off-scale muted"))) {
    console.error("SELFTEST FAIL — leftover plant escaped", leftover);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const source = fs.readFileSync(PAGE, "utf8");
  const planner = fs.readFileSync(PLANNER, "utf8");
  const kpi = fs.readFileSync(KPI, "utf8");
  const cards = fs.readFileSync(CARDS, "utf8");
  const unmatched = fs.readFileSync(UNMATCHED, "utf8");
  const wallet = fs.readFileSync(WALLET, "utf8");
  const fuelPlannerHome = fs.readFileSync(FUEL_PLANNER_HOME, "utf8");
  const failures = [
    ...computeFailures(source),
    ...computePlannerFailures(planner),
    ...computeKpiFailures(kpi),
    ...computeCardsFailures(cards),
    ...computeUnmatchedFailures(unmatched),
    ...computeWalletFailures(wallet),
    ...computeBoardShellFailures(fuelPlannerHome),
  ];
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] OK — Fuel Home dashboard + 443.282 board shell; Fuel Cards + Relay Unmatched + Relay Wallet V3; spend query fail-loud`,
  );
}

if (process.argv.includes("--selftest")) selftest();
else run();
