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
    forbid: ["PageHeader"],
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
    id: "FactoringHome",
    file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "KpiPanel", "CashFlowPanel", "CollapsedListFilters"],
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
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "SettlementsDeductionsBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsDeductionsBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "SettlementsCashAdvancesBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsCashAdvancesBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
    chromeOnly: true,
  },
  {
    id: "SettlementsEscrowBoard",
    file: "apps/frontend/src/pages/driver-finance/SettlementsEscrowBoard.tsx",
    forbid: ["PageHeader", "NavyPageSubNav"],
  },
  {
    id: "SettlementsToursRegister",
    file: "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx",
    forbid: ["PageHeader", "NavyPageSubNav", "V3Panel"],
    chromeOnly: true,
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

/** Companion: Settlements home chart/deductions must not hide panel-stack chrome in a child file. */
function assertSettlementsHomeNoPanelExtract() {
  const rel = "apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`${LABEL} FAIL — SettlementsHomeBoardPanels missing (${rel})`);
    process.exit(1);
  }
  const src = fs.readFileSync(abs, "utf8");
  // Import or JSX only — comments may mention the forbidden name.
  if (/import\s*\{[^}]*\bV3Panel\b/.test(src) || /<\s*V3Panel[\s/>]/.test(src)) {
    console.error(
      `${LABEL} FAIL — SettlementsHomeBoardPanels still mounts V3Panel (child extract theater; unwrap to bordered sections)`,
    );
    process.exit(1);
  }
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
