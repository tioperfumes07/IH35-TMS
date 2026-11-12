#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readDisk(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

// overrides: {relPath: plantedText} -- lets --selftest plant into a string; no file is written.
export function run(overrides = {}) {
  const errors = [];
  const read = (rel) => overrides[rel] ?? readDisk(rel);
  const page = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  const homeBoard = read("apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx");
  const helpers = read("apps/frontend/src/pages/driver-finance/settlementsHomeBoardHelpers.ts");
  const homeChrome = page + homeBoard;
  const companyPage = read("apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx");
  const detail = read("apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx");
  const header = read("apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx");
  const vendor = read("apps/frontend/src/components/vendors/VendorCreateModal.tsx");

  assert(
    page.includes("const kpiBaseQuery = useQuery") &&
      (page.includes("listSettlements(companyId)") || page.includes("listAllSettlements(companyId")),
    "SettlementsPage must query a list for KPI base (listSettlements or listAllSettlements)",
    errors
  );
  assert(
    page.includes("const kpiSettlements") && page.includes("kpiSettlements.filter"),
    "SettlementsPage KPIs must use kpiSettlements (not the table slice)",
    errors
  );
  assert(
    page.includes('dataTestId="settlements-filter-driver"') &&
      page.includes('kind="driver"') &&
      (page.includes("allowCreate={false}") || page.includes('EntityMultiSelect')) &&
      page.includes('searchParams.get("driver_id")'),
    "SettlementsPage must render a kind=driver filter (EntityPicker allowCreate=false or EntityMultiSelect) with dataTestId settlements-filter-driver and honor ?driver_id=",
    errors
  );

  // REG-005 — Settlements home KPI strip at the top, derived from data already fetched.
  // ROUND 443.250 — chrome is V3KpiTile (shared v3-tokens), not a locally-invented tile.
  assert(
    page.includes('data-testid="settlements-home-kpi-strip"') &&
      homeChrome.includes("V3KpiTile") &&
      page.includes("driverPayThisPeriod") &&
      page.includes('data-settlements-v3-kpis="1"') &&
      homeChrome.includes("settlements-home-week-chart-panel") &&
      homeChrome.includes("settlements-home-deductions-panel"),
    "Settlements home must render REG-005 KPI strip (SettlementsPage) + V3 week/deductions panels (SettlementsPage + SettlementsHomeBoardPanels)",
    errors
  );
  // ROUND 7.30 / Codex batch88 — historical week bars must select Week-of via week_start + onSelectWeek.
  assert(
    page.includes('searchParams.get("week_start")') &&
      page.includes("onSelectWeek={selectWeekStart}") &&
      homeBoard.includes("onSelectWeek") &&
      homeBoard.includes('data-testid={`settlements-home-week-bar-${w.label}`}') &&
      homeBoard.includes('role="button"') &&
      homeBoard.includes("aria-pressed"),
    "Settlements home week chart bars must be accessible selectors that set week_start / onSelectWeek",
    errors
  );
  // Codex batch91 — deductions panel caption follows the selected week (not a hard-wired "this week").
  assert(
    homeBoard.includes("Deductions · Week of") &&
      homeBoard.includes("formatWeekOfTitle(thisWeekBucket.weekStartIso)") &&
      !homeBoard.includes("Deductions this week"),
    "Settlements home deductions title must use selected-week caption (Week of …), not 'Deductions this week'",
    errors
  );
  // Codex batch92 — company-calendar week identity (not browser-local Sunday midnight).
  assert(
    helpers.includes("companyWeekStartSundayIso") &&
      helpers.includes("weekStartIso") &&
      page.includes("buildSettlementsWeekBuckets") &&
      page.includes("resolveSelectedWeekBucket") &&
      !page.includes("function startOfWeekSunday") &&
      !page.includes("weekStartIsoFromMs"),
    "Settlements week buckets must use companyWeekStartSundayIso / weekStartIso (no local startOfWeekSunday)",
    errors
  );
  // 443.280 fill — Payments focus filters are V3KpiTile (not local KpiCard chrome).
  assert(
    page.includes('data-settlements-payments-v3-kpis="1"') &&
      page.includes('testId="settlements-payments-kpi-pending-acks"') &&
      page.includes('testId="settlements-payments-kpi-held"') &&
      !/function KpiCard\(/.test(page),
    "Settlements Payments focus KPIs must be V3KpiTile (data-settlements-payments-v3-kpis; no local KpiCard)",
    errors
  );
  assert(
    companyPage.includes('data-testid="company-settlements-kpi-strip"') &&
      companyPage.includes("V3KpiTile") &&
      companyPage.includes('data-company-settlements-v3-kpis="1"') &&
      companyPage.includes("netRevenue") &&
      !companyPage.includes("DrillKpiCard"),
    "CompanySettlementsPage must render the REG-005 home KPI strip (company-settlements-kpi-strip) with V3KpiTile + data-company-settlements-v3-kpis + a real Net Revenue tile (no DrillKpiCard)",
    errors
  );

  assert(
    detail.includes("const settlementDisplayId =") && detail.includes("`Settlement ${settlementDisplayId}`"),
    "SettlementDetailPage must derive and render settlement display_id in the title",
    errors
  );
  assert(
    detail.includes("showManualPaidDraftBanner") && detail.includes("manual_paid"),
    "SettlementDetailPage must show an honest manual_paid / not finalized banner",
    errors
  );
  assert(
    detail.includes("showFinalizeBlock") && detail.includes("{showFinalizeBlock ? ("),
    "SettlementDetailPage must conditionally render the Finalize block",
    errors
  );

  assert(
    header.includes("settlementDisplayId?: string | null") &&
      (header.includes("{settlementDisplayId}") || header.includes("settlementDisplayId,") || /label=\{entityLabel\(settlementDisplayId/.test(header)),
    "SettlementHeader must accept and render settlementDisplayId",
    errors
  );

  // Week-of CSV money must use formatUsd (never bare toFixed — drops $ / grouping)
  assert(
    homeBoard.includes("formatUsd(Number(s.gross_pay") &&
      homeBoard.includes("formatUsd(Number(s.net_pay") &&
      !/Number\(s\.gross_pay \?\? 0\)\.toFixed\(2\)/.test(homeBoard),
    "SettlementsHomeBoardPanels week-of CSV must use formatUsd for money columns",
    errors
  );

  // Fill-not-shell / 443.280 — SettlementHeader uses BoardSection (not bare bordered grid card).
  assert(
    header.includes("<BoardSection") && header.includes('testId="settlement-header-board"'),
    "SettlementHeader must wrap in BoardSection (testId=settlement-header-board)",
    errors
  );
  assert(
    !/rounded-sm border border-gray-200 bg-white p-3/.test(header),
    "SettlementHeader must not keep layered bare card div",
    errors
  );

  const finalize = read("apps/frontend/src/pages/driver-finance/components/FinalizeBlock.tsx");
  assert(
    finalize.includes("<BoardSection") && finalize.includes('testId="settlement-finalize-block"'),
    "FinalizeBlock must wrap in BoardSection (testId=settlement-finalize-block)",
    errors
  );
  assert(
    finalize.includes("Save Draft") &&
      finalize.includes("onClick={onSaveDraft}") &&
      finalize.includes("pendingAcks || !checked || staleDebt") &&
      finalize.includes("Save debt-summary acknowledgment"),
    "FinalizeBlock Save Draft must gate on checked + pendingAcks + staleDebt and persist acknowledgment",
    errors
  );

  const workflow = read("apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx");
  assert(
    workflow.includes("onSaveDraft={() => {") &&
      workflow.includes("acknowledgeSettlement(settlementId, companyId)") &&
      workflow.includes("Draft saved — debt summary acknowledgment recorded"),
    "Workflow Save Draft must call acknowledgeSettlement (PATCH …/acknowledge)",
    errors
  );

  assert(
    vendor.includes("vendor_type_name ?? row.vendor_type_code ?? row.code ?? \"\""),
    "VendorCreateModal must fallback through vendor_type_name / vendor_type_code / code when display_name is empty",
    errors
  );

  return errors;
}

function selftest() {
  const PAGE_REL = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
  const BOARD_REL = "apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx";
  const COMPANY_REL = "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx";
  const backup = readDisk(PAGE_REL);
  const boardBackup = readDisk(BOARD_REL);
  const companyBackup = readDisk(COMPANY_REL);

  const patched = backup.replace(/const kpiBaseQuery = useQuery\(\{[\s\S]*?\n  \}\);\n/, "");
  const planted = run({ [PAGE_REL]: patched });
  if (!planted.some((e) => e.includes("KPI base"))) {
    throw new Error("planted kpiBaseQuery removal not detected");
  }

  // REG-005 — removing the home KPI strip from either page must be caught.
  if (
    !run({ [PAGE_REL]: backup.replace('data-testid="settlements-home-kpi-strip"', 'data-testid="x"') }).some(
      (e) => e.includes("settlements-home-kpi-strip") || e.includes("REG-005 KPI strip"),
    )
  ) {
    throw new Error("planted driver-settlements KPI strip removal not detected");
  }

  if (!run({ [COMPANY_REL]: companyBackup.replace('data-testid="company-settlements-kpi-strip"', 'data-testid="x"') }).some((e) => e.includes("company-settlements-kpi-strip"))) {
    throw new Error("planted company-settlements KPI strip removal not detected");
  }

  // ROUND 443.250 — dropping V3 chrome / week panel must fail.
  if (
    !run({ [PAGE_REL]: backup.replace(/V3KpiTile/g, "LegacyKpi") }).some(
      (e) => e.includes("V3KpiTile") || e.includes("REG-005 KPI strip"),
    )
  ) {
    throw new Error("planted V3KpiTile removal not detected");
  }
  if (
    !run({ [BOARD_REL]: boardBackup.replace("settlements-home-week-chart-panel", "x") }).some((e) =>
      e.includes("week/deductions"),
    )
  ) {
    throw new Error("planted settlements week chart panel removal not detected");
  }
  if (
    !run({
      [BOARD_REL]: boardBackup.replace(/formatUsd\(Number\(s\.gross_pay \?\? 0\)\)/g, "Number(s.gross_pay ?? 0).toFixed(2)"),
    }).some((e) => e.includes("formatUsd for money"))
  ) {
    throw new Error("planted week-of CSV toFixed regression not detected");
  }
  // ROUND 443.250 Company — dropping Company V3KpiTile / marker must fail.
  if (!run({ [COMPANY_REL]: companyBackup.replace(/V3KpiTile/g, "LegacyKpi") }).some((e) => e.includes("V3KpiTile"))) {
    throw new Error("planted Company V3KpiTile removal not detected");
  }
  if (
    !run({
      [COMPANY_REL]: companyBackup.replace('data-company-settlements-v3-kpis="1"', 'data-company-settlements-v3-kpis="0"'),
    }).some((e) => e.includes("data-company-settlements-v3-kpis"))
  ) {
    throw new Error("planted Company data-company-settlements-v3-kpis removal not detected");
  }
  const HELPERS_REL = "apps/frontend/src/pages/driver-finance/settlementsHomeBoardHelpers.ts";
  const helpersBackup = readDisk(HELPERS_REL);
  if (
    !run({
      [BOARD_REL]: boardBackup.replace("Deductions · Week of", "Deductions this week ·"),
    }).some((e) => e.includes("selected-week caption") || e.includes("Deductions this week"))
  ) {
    throw new Error("planted deductions 'this week' caption regression not detected");
  }
  if (
    !run({
      [HELPERS_REL]: helpersBackup.replace(/companyWeekStartSundayIso/g, "localWeekStartSundayIso"),
    }).some((e) => e.includes("companyWeekStartSundayIso") || e.includes("weekStartIso"))
  ) {
    throw new Error("planted companyWeekStartSundayIso removal not detected");
  }
  console.log(`[verify-settlement-fe-honesty] SELFTEST PASS — kpiBaseQuery + REG-005 driver/company strip + V3 chrome + week TZ/caption mutations detected`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-settlement-fe-honesty] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-settlement-fe-honesty] All checks passed ✓");
}

main();
