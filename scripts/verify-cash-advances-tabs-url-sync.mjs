#!/usr/bin/env node
/**
 * verify-cash-advances-tabs-url-sync.mjs — Ops F: Cash Advances tabs use ?tab=.
 *
 * ROUND 443.250 — also asserts Settlements-CashAdvances V3 KPI strip on CashAdvancesKpiRow
 * (V3KpiTile + data-cash-advances-v3-kpis + board labels). Piggyback EVEN step 990; no new claim.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advances-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";
const KPI_ROW = "apps/frontend/src/pages/cash-advances/components/CashAdvancesKpiRow.tsx";
const MOUNTED = "apps/frontend/src/pages/driver-finance/SettlementsMountedPages.tsx";
const SETTLEMENTS_BOARD = "apps/frontend/src/pages/driver-finance/SettlementsCashAdvancesBoard.tsx";

function failures(source) {
  const errors = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseCashAdvancesTab", 'params.set("tab", next)']) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  if (source.includes('useState<(typeof SUBNAV)[number][1]>("all")')) {
    errors.push("local tab useState still present");
  }
  for (const needle of [
    'title="Couldn\'t load cash advance totals"',
    "onRetry={() => void kpisQuery.refetch()}",
    'title="Couldn\'t load cash advances"',
    "onRetry={() => void listQuery.refetch()}",
    'title="Couldn\'t load cash advance details"',
    "onRetry={() => void detailQuery.refetch()}",
    "listQuery.isError ? (",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  return errors;
}

/** ROUND 443.250 + 443.274-C Settlements CashAdvances V3 board chrome. */
function kpiV3Failures(source) {
  const errors = [];
  if (!source.includes("V3KpiTile")) {
    errors.push("CashAdvancesKpiRow must render V3KpiTile (ROUND 443.250 CashAdvances V3)");
  }
  if (!source.includes("data-cash-advances-v3-kpis")) {
    errors.push("CashAdvancesKpiRow must mark data-cash-advances-v3-kpis for the V3 board strip");
  }
  for (const label of [
    "Advances on file",
    "Requests awaiting owner",
    "Outstanding to recover",
    "Recovered this period",
  ]) {
    if (!new RegExp(`label=["']${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source)) {
      errors.push(`CashAdvancesKpiRow V3 strip must include board label "${label}"`);
    }
  }
  if (!source.includes('amount(kpis, "total_outstanding")')) {
    errors.push('CashAdvancesKpiRow must keep total_outstanding (liability KPI; engine unchanged)');
  }
  if (!source.includes('amount(kpis, "pending_approval")')) {
    errors.push('CashAdvancesKpiRow must keep pending_approval (Requests awaiting owner)');
  }
  if (!source.includes('amount(kpis, "advances_on_file")')) {
    errors.push('CashAdvancesKpiRow must read advances_on_file (Advances on file count)');
  }
  // ROUND 443.274-C — board body 1fr|2fr Requests | Advances + footnote.
  if (!source.includes("V3Panel")) {
    errors.push("CashAdvancesKpiRow must render V3Panel for Requests|Advances (443.274-C)");
  }
  if (!source.includes('data-settlements-cash-advances-board-1fr-2fr')) {
    errors.push("CashAdvancesKpiRow must mark data-settlements-cash-advances-board-1fr-2fr");
  }
  if (!source.includes('gridTemplateColumns: "1fr 2fr"')) {
    errors.push('CashAdvancesKpiRow board body must use gridTemplateColumns "1fr 2fr"');
  }
  if (!source.includes("No requests waiting")) {
    errors.push("CashAdvancesKpiRow Requests empty must say No requests waiting");
  }
  if (!source.includes("Each advance links to its bank line (Zelle) and to the tour that recovers it.")) {
    errors.push("CashAdvancesKpiRow must keep the board Advances footnote");
  }
  for (const col of ["Asked", "Policy", "Recover on", "Paid"]) {
    if (!source.includes(col)) {
      errors.push(`CashAdvancesKpiRow board must include column "${col}"`);
    }
  }
  return errors;
}

/** ROUND 443.282 — Settlements mount replaces body; no CashAdvancesHome layer. */
function settlementsBoardFailures(mountedSource, boardSource) {
  const errors = [];
  if (!mountedSource.includes("SettlementsCashAdvancesBoard")) {
    errors.push("SettlementsMountedPages must mount SettlementsCashAdvancesBoard");
  }
  if (mountedSource.includes("CashAdvancesHomePage")) {
    errors.push("SettlementsMountedPages must not mount CashAdvancesHomePage under Settlements shell");
  }
  if (!boardSource.includes("data-settlements-cash-advances-rebuild")) {
    errors.push("SettlementsCashAdvancesBoard must mark data-settlements-cash-advances-rebuild");
  }
  if (!boardSource.includes("CashAdvancesKpiRow")) {
    errors.push("SettlementsCashAdvancesBoard must render CashAdvancesKpiRow (board body only)");
  }
  if (boardSource.includes("NavyPageSubNav") || boardSource.includes("CashAdvancesTable")) {
    errors.push("SettlementsCashAdvancesBoard must not include legacy subnav or ParityTable roster");
  }
  return errors;
}

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = failures(source);
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")} in ${PAGE}`);
  const kpiSource = fs.readFileSync(path.join(ROOT, KPI_ROW), "utf8");
  const kpiErrors = kpiV3Failures(kpiSource);
  if (kpiErrors.length) throw new Error(`${LABEL}: ${kpiErrors.join("; ")} in ${KPI_ROW}`);
  const mountedSource = fs.readFileSync(path.join(ROOT, MOUNTED), "utf8");
  const boardSource = fs.readFileSync(path.join(ROOT, SETTLEMENTS_BOARD), "utf8");
  const boardErrors = settlementsBoardFailures(mountedSource, boardSource);
  if (boardErrors.length) throw new Error(`${LABEL}: ${boardErrors.join("; ")} (443.282)`);
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) {
  const good = `useSearchParams searchParams.get("tab") parseCashAdvancesTab params.set("tab", next)
    title="Couldn't load cash advance totals" onRetry={() => void kpisQuery.refetch()}
    title="Couldn't load cash advances" onRetry={() => void listQuery.refetch()} listQuery.isError ? (
    title="Couldn't load cash advance details" onRetry={() => void detailQuery.refetch()}`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed: ${failures(good).join("; ")}`);
  const mutations = [
    "useSearchParams",
    'title="Couldn\'t load cash advance totals"',
    "onRetry={() => void kpisQuery.refetch()}",
    'title="Couldn\'t load cash advances"',
    "onRetry={() => void listQuery.refetch()}",
    'title="Couldn\'t load cash advance details"',
    "onRetry={() => void detailQuery.refetch()}",
    "listQuery.isError ? (",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  const goodKpi = `
    import { V3KpiTile } from "../../../components/v3/V3KpiTile";
    import { V3Panel } from "../../../components/v3/V3Panel";
    data-cash-advances-v3-kpis="1"
    data-settlements-cash-advances-board-1fr-2fr="1"
    gridTemplateColumns: "1fr 2fr"
    <V3KpiTile label="Advances on file" value="12" />
    <V3KpiTile label="Requests awaiting owner" value="0" />
    <V3KpiTile label="Outstanding to recover" value="$0.00" />
    <V3KpiTile label="Recovered this period" value="—" />
    amount(kpis, "total_outstanding")
    amount(kpis, "pending_approval")
    amount(kpis, "advances_on_file")
    No requests waiting
    Asked
    Policy
    Recover on
    Paid
    Each advance links to its bank line (Zelle) and to the tour that recovers it.
  `;
  if (kpiV3Failures(goodKpi).length) {
    throw new Error(`${LABEL}: good KPI fixture failed: ${kpiV3Failures(goodKpi).join("; ")}`);
  }
  const v3Stripped = goodKpi.replace(/V3KpiTile/g, "LegacyKpi").replace(/data-cash-advances-v3-kpis/g, "data-legacy");
  if (!kpiV3Failures(v3Stripped).some((e) => e.includes("V3KpiTile"))) {
    throw new Error(`${LABEL}: V3KpiTile removal should fail`);
  }
  const boardStripped = goodKpi.replace(/1fr 2fr/g, "1fr 1fr").replace(/data-settlements-cash-advances-board-1fr-2fr/g, "data-x");
  if (!kpiV3Failures(boardStripped).some((e) => e.includes("1fr 2fr") || e.includes("board-1fr-2fr"))) {
    throw new Error(`${LABEL}: board 1fr|2fr removal should fail`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} tab mutations + V3 KPI + 443.274-C board markers caught)`);
} else run();
