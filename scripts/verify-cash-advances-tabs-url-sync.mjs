#!/usr/bin/env node
/**
 * verify-cash-advances-tabs-url-sync.mjs — Ops F: Cash Advances tabs use ?tab=.
 *
 * ROUND 443.250 / 443.326 — Settlements-CashAdvances V3 board on SettlementsCashAdvancesBoard
 * (V3KpiTile + MoneyListToolbar + ParityTable + BoardSection 1fr|2fr). Piggyback EVEN step 990.
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
const SETTLEMENTS_BOARD_STRINGS = "apps/frontend/src/pages/driver-finance/settlementsV3BoardStrings.ts";

function failures(source) {
  const errors = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseCashAdvancesTab", 'params.set("tab", next)']) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  if (source.includes('useState<(typeof SUBNAV)[number][1]>("all")')) {
    errors.push("local tab useState still present");
  }
  // Standalone CashAdvancesHome — list + detail errors (KPI totals live on SettlementsCashAdvancesBoard under Settlements shell).
  for (const needle of [
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

/** ROUND 443.326 — CashAdvancesKpiRow keep BoardSection (Drivers/legacy mount path). */
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
  // ROUND 443.326 — BoardSection replaces V3Panel for Requests|Advances.
  if (!source.includes("BoardSection")) {
    errors.push("CashAdvancesKpiRow must render BoardSection for Requests|Advances (443.326)");
  }
  if (/import\s*\{[^}]*\bV3Panel\b/.test(source) || /<\s*V3Panel[\s/>]/.test(source)) {
    errors.push("CashAdvancesKpiRow must not remount V3Panel (443.326 BoardSection)");
  }
  if (!source.includes("data-settlements-cash-advances-board-1fr-2fr")) {
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

/** 443.326 i18n hub — copy lives in settlementsV3BoardStrings.ts; board wires S443326.cashAdvances.* */
function settlementsBoardStringHubFailures(boardSource, stringsSource) {
  const errors = [];
  if (!boardSource.includes('from "./settlementsV3BoardStrings"')) {
    errors.push("SettlementsCashAdvancesBoard must import settlementsV3BoardStrings (443.326 i18n hub)");
  }
  if (!boardSource.includes("S443326.cashAdvances")) {
    errors.push("SettlementsCashAdvancesBoard must wire S443326.cashAdvances copy keys");
  }
  const keyToLiteral = {
    errKpiTitle: "Couldn't load cash advance totals",
    kpiOnFile: "Advances on file",
    kpiAwaiting: "Requests awaiting owner",
    kpiOutstanding: "Outstanding to recover",
    kpiRecovered: "Recovered this period",
    emptyRequests: "No requests waiting",
    advancesFooter:
      "Each advance links to its bank line (Zelle) and to the tour that recovers it.",
  };
  for (const [key, literal] of Object.entries(keyToLiteral)) {
    if (!stringsSource.includes(`${key}: ${JSON.stringify(literal).slice(1, -1)}`) &&
        !stringsSource.includes(`${key}: "${literal}"`) &&
        !stringsSource.includes(`${key}:\n      "${literal}"`)) {
      // multiline advancesFooter uses template on two lines
      if (key === "advancesFooter") {
        if (!stringsSource.includes("Each advance links to its bank line (Zelle)")) {
          errors.push(`settlementsV3BoardStrings missing cashAdvances.${key}`);
        }
      } else if (!stringsSource.includes(literal)) {
        errors.push(`settlementsV3BoardStrings missing literal for cashAdvances.${key}`);
      }
    }
    if (!boardSource.includes(`S443326.cashAdvances.${key}`)) {
      errors.push(`SettlementsCashAdvancesBoard must reference S443326.cashAdvances.${key}`);
    }
  }
  return errors;
}

/** ROUND 443.326 — Settlements board is full V3 grammar in the surface file. */
function settlementsBoardFailures(mountedSource, boardSource, stringsSource) {
  const errors = [];
  errors.push(...settlementsBoardStringHubFailures(boardSource, stringsSource));
  if (!mountedSource.includes("SettlementsCashAdvancesBoard")) {
    errors.push("SettlementsMountedPages must mount SettlementsCashAdvancesBoard");
  }
  if (mountedSource.includes("CashAdvancesHomePage")) {
    errors.push("SettlementsMountedPages must not mount CashAdvancesHomePage under Settlements shell");
  }
  if (!boardSource.includes("data-settlements-cash-advances-rebuild")) {
    errors.push("SettlementsCashAdvancesBoard must mark data-settlements-cash-advances-rebuild");
  }
  if (!boardSource.includes("V3KpiTile")) {
    errors.push("SettlementsCashAdvancesBoard must render V3KpiTile in the surface file (443.326)");
  }
  if (!boardSource.includes("MoneyListToolbar")) {
    errors.push("SettlementsCashAdvancesBoard must mount MoneyListToolbar (443.326)");
  }
  if (!boardSource.includes("<ParityTable")) {
    errors.push("SettlementsCashAdvancesBoard must mount <ParityTable in the surface file (443.326)");
  }
  if (!boardSource.includes("BoardSection")) {
    errors.push("SettlementsCashAdvancesBoard must use BoardSection for Requests|Advances (443.326)");
  }
  if (/import\s*\{[^}]*\bV3Panel\b/.test(boardSource) || /<\s*V3Panel[\s/>]/.test(boardSource)) {
    errors.push("SettlementsCashAdvancesBoard must not remount V3Panel (443.326)");
  }
  if (boardSource.includes("NavyPageSubNav")) {
    errors.push("SettlementsCashAdvancesBoard must not include legacy NavyPageSubNav");
  }
  if (!boardSource.includes('data-settlements-cash-advances-board-1fr-2fr')) {
    errors.push("SettlementsCashAdvancesBoard must mark data-settlements-cash-advances-board-1fr-2fr");
  }
  if (!boardSource.includes('gridTemplateColumns: "1fr 2fr"')) {
    errors.push('SettlementsCashAdvancesBoard board body must use gridTemplateColumns "1fr 2fr"');
  }
  if (!boardSource.includes("onRetry={() => void kpisQuery.refetch()}")) {
    errors.push("SettlementsCashAdvancesBoard missing KPI onRetry refetch");
  }
  if (!boardSource.includes('amount(kpisQuery.data') && !boardSource.includes("advances_on_file")) {
    errors.push("SettlementsCashAdvancesBoard must read advances_on_file from KPI feed");
  }
  if (!boardSource.includes("pending_approval") || !boardSource.includes("total_outstanding")) {
    errors.push("SettlementsCashAdvancesBoard must wire pending_approval and total_outstanding KPI keys");
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
  const stringsSource = fs.readFileSync(path.join(ROOT, SETTLEMENTS_BOARD_STRINGS), "utf8");
  const boardErrors = settlementsBoardFailures(mountedSource, boardSource, stringsSource);
  if (boardErrors.length) throw new Error(`${LABEL}: ${boardErrors.join("; ")} (443.326)`);
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) {
  const good = `useSearchParams searchParams.get("tab") parseCashAdvancesTab params.set("tab", next)
    title="Couldn't load cash advances" onRetry={() => void listQuery.refetch()} listQuery.isError ? (
    title="Couldn't load cash advance details" onRetry={() => void detailQuery.refetch()}`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed: ${failures(good).join("; ")}`);
  const mutations = [
    "useSearchParams",
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
    import { BoardSection } from "../../../components/v3/BoardSection";
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
  console.log(`${LABEL}: selftest PASS (${mutations.length} tab mutations + V3 KPI + 443.326 BoardSection markers caught)`);
} else run();
