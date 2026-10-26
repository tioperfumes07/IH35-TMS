#!/usr/bin/env node
/**
 * ROUND 443.326 — V3 board grammar on every surface of the 10-24 Cursor audit.
 *
 * Each surface must mount: kpiStrip (V3KpiTile | moneyListKpiCard | kpiStrip prop) +
 * MoneyListToolbar + ParityTable, and must NOT remount the legacy chrome listed for it.
 *
 * Ratchet: FAILING_SURFACE_BASELINE shrink-only. Ends at 0. --selftest plants PageHeader
 * back onto BillsPage → exit 1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-v3-board-grammar-every-surface";

/**
 * Measured 2026-10-24 on tip after ENG-32 merge (claim 18800). Lower only; never raise.
 * Count = surfaces that fail REQUIRED mounts or still carry FORBIDDEN legacy.
 */
const FAILING_SURFACE_BASELINE = 0;

/** @typedef {{ id: string, file: string, forbid?: string[], note?: string, chromeOnly?: boolean }} Surface */

/** The 23 surfaces from CURSOR-ORDERS-443325-443326.md (+ Bills/Recurring keep-done).
 * chromeOnly = forbid-only check (BoardChrome / shell extracts — no kpi/MLT/ParityTable required). */
const SURFACES = /** @type {Surface[]} */ ([
  {
    id: "SettlementsPage",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "SettlementDetailPage",
    file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    forbid: ["PageHeader"],
  },
  {
    id: "SettlementStatementWorkflowPage",
    file: "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx",
    forbid: ["PageHeader"],
  },
  {
    id: "SettlementCloseArrivalPage",
    file: "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "CashAdvancesHome",
    file: "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
  },
  {
    id: "EscrowRegisterPage",
    file: "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx",
    forbid: ["PageHeader", "V3Panel"],
  },
  {
    id: "EscrowDeductionsPendingTab",
    file: "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx",
    forbid: ["PageHeader"],
  },
  {
    id: "EscrowPage",
    file: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    forbid: [],
  },
  {
    id: "FuelPlannerHome",
    file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
  },
  {
    // 443.280 — KPIs live on FactoringHomeBoard (Account summary); shell is chrome-only.
    id: "FactoringHome",
    file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "CollapsedListFilters"],
    chromeOnly: true,
  },
  {
    id: "FactoringBoardChrome",
    file: "apps/frontend/src/pages/factoring/FactoringBoardChrome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "CustomersBoardChrome",
    file: "apps/frontend/src/pages/customers/CustomersBoardChrome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "VendorsBoardChrome",
    file: "apps/frontend/src/pages/vendors/VendorsBoardChrome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "CompanySettlementsPage",
    file: "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "SettlementsModuleShell",
    file: "apps/frontend/src/pages/driver-finance/SettlementsModuleShell.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "SettlementsPreSettlementsBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsPreSettlementsBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "SettlementsDeductionsBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsDeductionsBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "SettlementsCashAdvancesBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsCashAdvancesBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "SettlementsEscrowBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsEscrowBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    // 443.280 — Open/Closed FULL board: V3KpiTile + MoneyListToolbar + ParityTable in this surface.
    id: "SettlementsToursRegister",
    file: "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
  },
  {
    id: "FactoringListPage",
    file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    forbid: [],
  },
  {
    id: "Customers",
    file: "apps/frontend/src/pages/Customers.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "CollapsedListFilters"],
  },
  {
    id: "Vendors",
    file: "apps/frontend/src/pages/Vendors.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "CollapsedListFilters"],
  },
  {
    id: "CreateMultipleBillsPage",
    file: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
    forbid: [],
  },
  {
    id: "VendorBillCreatePage",
    file: "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx",
    forbid: [],
  },
  {
    id: "BillPaymentsListPage",
    file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
    forbid: [],
  },
  {
    id: "InvoicesListPage",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    forbid: [],
  },
  {
    id: "ExpensesListPage",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    forbid: [],
  },
  {
    id: "VendorCreditsPage",
    file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
    forbid: ["CollapsedListFilters"],
  },
  {
    id: "CreditMemosPage",
    file: "apps/frontend/src/pages/accounting/CreditMemosPage.tsx",
    forbid: ["CollapsedListFilters"],
  },
  {
    id: "ManualJEListPage",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    forbid: [],
  },
  {
    id: "PaymentsListPage",
    file: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    forbid: ["CollapsedListFilters"],
  },
  {
    id: "FuelHome",
    file: "apps/frontend/src/pages/fuel/FuelHome.tsx",
    forbid: ["PageHeader", "V3Panel"],
  },
  {
    id: "BillsPage",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "CollapsedListFilters"],
  },
  {
    id: "RecurringBillList",
    file: "apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "CollapsedListFilters"],
  },
  // ROUND 443.326 — Cash Flow / Legal Home / Accounting Hub: BoardSection (no V3Panel).
  // chromeOnly: hub/dashboard/filter-locked tabs (KPI + panels; MLT not on Banking-style CF filters).
  {
    id: "CashFlowHomeTab",
    file: "apps/frontend/src/pages/cash-flow/tabs/CashFlowHomeTab.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "ActualVsProjectedTab",
    file: "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "RollingLedgerTab",
    file: "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "ManualDailyProjectionsTab",
    file: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "DailyPredictionTab",
    file: "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "LegalHomeBoard",
    file: "apps/frontend/src/pages/legal/components/LegalHomeBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "AccountingHubPage",
    file: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  // ROUND 443.326 — Insurance / Banking Home: BoardSection hubs (KPI + panels; not list boards).
  {
    id: "InsuranceHomeBoard",
    file: "apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
  {
    id: "BankingHomeBoard",
    file: "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
  },
]);

function hasKpiMount(src) {
  return (
    /\bV3KpiTile\b/.test(src) ||
    /\bmoneyListKpiCard\b/.test(src) ||
    /\bkpiStrip=/.test(src) ||
    /data-testid="[^"]*-kpi-strip"/.test(src)
  );
}

function hasMoneyListToolbar(src) {
  return /\bMoneyListToolbar\b/.test(src);
}

function hasParityTable(src, surfaceId) {
  // JSX mount only — import/comment "ParityTable" alone is theater (ROUND 443.326).
  if (/<ParityTable[\s/<]/.test(src) || /ParityTable\s*</.test(src)) return true;
  // Fuel history roster: FuelTransactionsTable is the ParityTable wrapper for that surface.
  if (surfaceId === "FuelPlannerHome" && /\bFuelTransactionsTable\b/.test(src)) return true;
  // Cash advances roster: CashAdvancesTable is the ParityTable wrapper for that surface.
  if (surfaceId === "CashAdvancesHome" && /\bCashAdvancesTable\b/.test(src)) return true;
  return false;
}

function legacyHits(src, forbid) {
  const hits = [];
  for (const name of forbid ?? []) {
    // Import or JSX mount — word boundary so MoneyListToolbar does not match ListToolbar.
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(src)) hits.push(name);
  }
  return hits;
}

function evaluateSurface(surface, srcOverride) {
  const abs = path.join(ROOT, surface.file);
  if (!fs.existsSync(abs) && srcOverride == null) {
    return { id: surface.id, file: surface.file, ok: false, reasons: ["file missing"] };
  }
  const src = srcOverride ?? fs.readFileSync(abs, "utf8");
  const reasons = [];
  if (!surface.chromeOnly) {
    if (!hasKpiMount(src)) reasons.push("missing kpiStrip/V3KpiTile/moneyListKpiCard");
    if (!hasMoneyListToolbar(src)) reasons.push("missing MoneyListToolbar");
    if (!hasParityTable(src, surface.id)) reasons.push("missing ParityTable JSX mount");
  }
  const legacy = legacyHits(src, surface.forbid);
  if (legacy.length) reasons.push(`legacy still mounted: ${legacy.join(",")}`);
  return { id: surface.id, file: surface.file, ok: reasons.length === 0, reasons };
}

function measureAll(overrides = {}) {
  return SURFACES.map((s) => evaluateSurface(s, overrides[s.file]));
}

function selftest() {
  const bills = SURFACES.find((s) => s.id === "BillsPage");
  if (!bills) throw new Error("BillsPage surface missing from table");
  const abs = path.join(ROOT, bills.file);
  const src = fs.readFileSync(abs, "utf8");
  const planted = `${src}\nimport { PageHeader } from "../../components/layout/PageHeader";\n<PageHeader title="planted" />\n`;
  const results = measureAll({ [bills.file]: planted });
  const plantedResult = results.find((r) => r.id === "BillsPage");
  if (!plantedResult || plantedResult.ok) {
    console.error(`${LABEL} SELFTEST FAIL — planting PageHeader on BillsPage did not fail the surface`);
    process.exit(1);
  }
  if (!plantedResult.reasons.some((r) => r.includes("PageHeader"))) {
    console.error(`${LABEL} SELFTEST FAIL — expected PageHeader in reasons, got: ${plantedResult.reasons.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — planted PageHeader on BillsPage fails as required`);
}

/**
 * Companion: Settlements › Home board vs docs/design/v3/Settlements (443.280).
 * Folded here (step 18800 already CLAIMED) — do NOT add a sibling verify-settlements-home-board
 * / new verify-steps claim; TOOL-F03 forbids CLAIMED-NUMBERS edits in feature PRs.
 */
function assertSettlementsHomeNoPanelExtract() {
  const panelsRel = "apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx";
  const pageRel = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
  const panelsAbs = path.join(ROOT, panelsRel);
  const pageAbs = path.join(ROOT, pageRel);
  if (!fs.existsSync(panelsAbs)) {
    console.error(`${LABEL} FAIL — SettlementsHomeBoardPanels missing (${panelsRel})`);
    process.exit(1);
  }
  if (!fs.existsSync(pageAbs)) {
    console.error(`${LABEL} FAIL — SettlementsPage missing (${pageRel})`);
    process.exit(1);
  }
  const panels = fs.readFileSync(panelsAbs, "utf8");
  const page = fs.readFileSync(pageAbs, "utf8");
  const fail = (msg) => {
    console.error(`${LABEL} FAIL — Settlements Home board: ${msg}`);
    process.exit(1);
  };
  // Import or JSX only — comments may mention the forbidden name.
  if (/import\s*\{[^}]*\bV3Panel\b/.test(panels) || /<\s*V3Panel[\s/>]/.test(panels)) {
    fail("SettlementsHomeBoardPanels still mounts V3Panel (unwrap to shared BoardSection)");
  }
  // 443.280 — shared BoardSection only (local function BoardSection was LAYERED extract theater).
  if (/function BoardSection\(/.test(panels)) {
    fail("SettlementsHomeBoardPanels defines local BoardSection; import shared components/v3/BoardSection");
  }
  if (!/from ["'].*components\/v3\/BoardSection["']/.test(panels)) {
    fail("SettlementsHomeBoardPanels must import shared BoardSection");
  }
  if (!/Net driver pay by week/.test(panels)) fail('missing "Net driver pay by week" panel');
  if (!/Deductions this week/.test(panels)) fail('missing "Deductions this week" panel');
  if (!/11 weeks, not cancelled, not sample|weeks, not cancelled, not sample/.test(panels)) {
    fail('chart footer must use board "weeks, not cancelled, not sample" grammar');
  }
  if (!/>Status</.test(panels) && !/Status<\/span>/.test(panels)) {
    fail("Week-of table must have Status column (board ● Paid/Open)");
  }
  if (!/function boardStatus/.test(panels) || !/label: "Paid"/.test(panels) || !/label: "Open"/.test(panels)) {
    fail("Status must paint Paid/Open (board ● Paid / ● Open)");
  }
  if (!/<SettlementRefCell\b/.test(panels)) {
    fail("Loads column must mount SettlementRefCell (ALL-SEATS beside load)");
  }
  if (!/settlements-home-week-of-export/.test(panels)) {
    fail("Week-of header must expose Export (board)");
  }
  if (!/exportWeekOfSettlementsCsv/.test(panels) || /[?&]export=1/.test(panels)) {
    fail("Week-of Export must download CSV of on-screen rows (not dead export-flag navigate)");
  }
  if (!/<SettlementsHomeBoardPanels\b/.test(page)) {
    fail("SettlementsPage must mount SettlementsHomeBoardPanels on settlements tab");
  }
  if (!/companyId=\{companyId\}/.test(page) || !/<SettlementsHomeBoardPanels[\s\S]{0,400}companyId=\{companyId\}/.test(page)) {
    fail("SettlementsHomeBoardPanels must receive companyId (SettlementRefCell)");
  }
  if (!/data-testid="settlements-home-kpi-strip"/.test(page)) fail("Home KPI strip missing");
  if (!/<V3KpiTile\b/.test(page)) fail("Home must mount V3KpiTile strip");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  assertSettlementsHomeNoPanelExtract();

  const results = measureAll();
  const failing = results.filter((r) => !r.ok);
  const failCount = failing.length;

  for (const r of failing) {
    console.error(`  FAIL ${r.id} (${r.file}): ${r.reasons.join("; ")}`);
  }

  if (failCount > FAILING_SURFACE_BASELINE) {
    console.error(
      `${LABEL} FAIL — ${failCount} failing surfaces > baseline ${FAILING_SURFACE_BASELINE} (ratchet up forbidden)`,
    );
    process.exit(1);
  }
  if (failCount < FAILING_SURFACE_BASELINE) {
    console.error(
      `${LABEL} FAIL — baseline stale: measured ${failCount}, baseline ${FAILING_SURFACE_BASELINE}. ` +
        `Lower FAILING_SURFACE_BASELINE to ${failCount} in this same commit (no slack).`,
    );
    process.exit(1);
  }

  console.log(
    `${LABEL} OK — ${failCount}/${SURFACES.length} failing (= baseline ${FAILING_SURFACE_BASELINE}); ratchet holds. Pass count ${SURFACES.length - failCount}.`,
  );
}

main();
