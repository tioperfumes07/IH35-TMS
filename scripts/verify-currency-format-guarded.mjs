#!/usr/bin/env node
// Guard: the dispatch board's currency formatting can NEVER crash the List/Table grid on a no-load
// (truck-centric Awaiting) row. formatMoneyCents must return "—" on a missing amount and default the
// currency, and the board's Linehaul cell must route through it (no raw Intl.NumberFormat).
// House USD path must use formatUsdCents (lib/money); MXN may keep Intl.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-currency-format-guarded: ${m}`);
  process.exit(1);
};

const constants = read("apps/frontend/src/components/dispatch/constants.ts");
// formatMoneyCents accepts nullable amount and returns "—" on missing input.
if (!/formatMoneyCents\(valueCents: number \| null \| undefined/.test(constants)) {
  fail("formatMoneyCents must accept a nullable amount (number | null | undefined)");
}
if (!/if \(valueCents == null[\s\S]{0,80}return "—"/.test(constants)) fail("formatMoneyCents must return '—' on a null/NaN amount (no NumberFormat call)");
if (!/const cur = currency \|\| "USD"/.test(constants)) fail("formatMoneyCents must default a missing currency to USD (never pass blank/undefined to NumberFormat)");
if (!/from ["'][^"']*lib\/money["']/.test(constants) || !/formatUsdCents/.test(constants)) {
  fail("formatMoneyCents must import formatUsdCents from lib/money for the USD path");
}
if (!/cur === "MXN"/.test(constants)) fail("formatMoneyCents must keep an explicit MXN house branch");
if (!/formatQuantityTable/.test(constants)) fail("formatMoneyCents MXN path must use formatQuantityTable");
if (!/return formatUsdCents\(valueCents\)/.test(constants)) fail("formatMoneyCents USD path must return formatUsdCents(valueCents)");

// The board's Linehaul cell routes through formatMoneyCents (no raw currency NumberFormat on the board).
const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (/new Intl\.NumberFormat\([^)]*style:\s*["']currency/.test(board)) fail("DispatchBoard must NOT call Intl.NumberFormat(currency) directly — use formatMoneyCents");
if (!/linehaul[\s\S]{0,80}formatMoneyCents/.test(board)) fail("Linehaul cell must use formatMoneyCents");

// Book load wizard + settlement profitability: no per-file USD Intl money helper.
const book = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
if (/new Intl\.NumberFormat\([\s\S]{0,120}style:\s*["']currency["']/.test(book)) {
  fail("BookLoadModalV4 must NOT hand-roll Intl.NumberFormat currency — use formatUsdCents");
}
if (!/formatUsdCents\(customerInvoiceTotal\)/.test(book)) fail("BookLoadModalV4 invoice total must use formatUsdCents");

const profit = read("apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx");
if (!/formatUsdCents/.test(profit) || !/from ["'][^"']*lib\/money["']/.test(profit)) {
  fail("SettlementProfitabilityCard must import formatUsdCents from lib/money");
}
if (!/cur === "MXN"/.test(profit)) fail("SettlementProfitabilityCard must keep an explicit MXN Intl branch");

// Cursor house-money wave — no per-file toFixed(2) / $ template USD money on these surfaces.
const earnings = read("apps/frontend/src/components/drivers/EarningsTab.tsx");
if (!/formatUsd/.test(earnings) || !/from ["'][^"']*lib\/money["']/.test(earnings)) {
  fail("EarningsTab must import formatUsd from lib/money");
}
if (/\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(earnings) || /`\$\$\{[^`]*toFixed\(2\)\}`/.test(earnings)) {
  fail("EarningsTab must not hand-roll $ + toFixed(2) money");
}

const fines = read("apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx");
if (!/formatUsd\(Math\.abs\(Number\(line\.amount\)\)\)/.test(fines)) {
  fail("FinesDeductionsCard pre-settlement lines must use formatUsd");
}
if (/−\$\$\{Math\.abs/.test(fines) || /−\$\$\{/.test(fines)) {
  fail("FinesDeductionsCard must not hand-roll −$ + toFixed money");
}

const quality = read("apps/frontend/src/components/dispatch/LoadQualityEventsReverseSection.tsx");
if (!/formatUsd\(Number\(event\.dollar_impact_amount\)\)/.test(quality)) {
  fail("LoadQualityEventsReverseSection must format dollar_impact via formatUsd");
}

const stops = read("apps/frontend/src/components/dispatch/LoadStopsRecordTab.tsx");
if (!/formatUsdCents\(stop\.lumper_amount_cents\)/.test(stops)) {
  fail("LoadStopsRecordTab lumper amount must use formatUsdCents");
}

const tourSettle = read("apps/frontend/src/components/dispatch/TourSettlementTab.tsx");
if (!/formatUsdRateTable\(c \/ 100\)/.test(tourSettle)) fail("TourSettlementTab rate must use formatUsdRateTable");
if (!/formatUsd\(c \/ 100\)\/mi/.test(tourSettle) && !/\$\{formatUsd\(c \/ 100\)\}\/mi/.test(tourSettle)) {
  fail("TourSettlementTab perMile must use formatUsd");
}

const customer = read("apps/frontend/src/pages/CustomerDetail.tsx");
if (!/formatUsd\(qualityStats\.totalImpact\)/.test(customer)) fail("CustomerDetail Dollar Impact KPI must use formatUsd");
if (!/formatUsdCents\(Number\(invoice\.total_cents/.test(customer)) fail("CustomerDetail invoice total must use formatUsdCents");
if (!/formatUsdCents\(lane\.fsc_per_mile_cents\)/.test(customer)) fail("CustomerDetail FSC/mi must use formatUsdCents");
if (!/formatUsd\(Number\(v\)/.test(customer)) fail("CustomerDetail revenue chart tooltip must use formatUsd");
if (!/formatQuantityTable\(qualityStats\.avgDaysLate, 1\)/.test(customer)) fail("CustomerDetail Avg Days Late must use formatQuantityTable");
if (!/formatQuantityTable\(Number\(customerPnlRow\.gross_margin_pct\) \|\| 0, 1\)/.test(customer)) {
  fail("CustomerDetail margin % must use formatQuantityTable");
}
if (!/formatQuantityTable\(Number\(customer\.layover_charge_per_day\), 2\)/.test(customer)) {
  fail("CustomerDetail non-USD layover charge must use formatQuantityTable");
}

const vendorParts = read("apps/frontend/src/pages/vendors/VendorPartsHistorySection.tsx");
if (!/formatUsd/.test(vendorParts) || /\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(vendorParts)) {
  fail("VendorPartsHistorySection must format invoice amount via formatUsd");
}
const unitParts = read("apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx");
if (!/formatUsd/.test(unitParts) || /\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(unitParts)) {
  fail("UnitPartsHistorySection must format invoice amount via formatUsd");
}
const stock = read("apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
if (!/formatUsd\(Number\(row\.unit_cost\)\)/.test(stock)) {
  fail("InventoryPartsStockPage unit_cost must use formatUsd");
}
const comparable = read("apps/frontend/src/components/vehicle-profile/ComparableUnitsWidget.tsx");
if (!/formatUsd\(cents \/ 100\)/.test(comparable)) {
  fail("ComparableUnitsWidget per-mile must use formatUsd");
}
const driverHub = read("apps/frontend/src/pages/home/DriverHubReportingPage.tsx");
if (!/formatUsdCents\(r\.approved_advance_cents\)/.test(driverHub)) {
  fail("DriverHubReportingPage CSV approved volume must use formatUsdCents");
}
if (/\(r\.approved_advance_cents \/ 100\)\.toFixed\(2\)/.test(driverHub)) {
  fail("DriverHubReportingPage must not hand-roll approved_advance_cents / 100 toFixed");
}


const cashAdvRev = read("apps/frontend/src/components/driver-profile/DriverCashAdvancesReverseSection.tsx");
if (!/formatUsdCents/.test(cashAdvRev) || !/formatUsd\(Number\(row\.amount/.test(cashAdvRev)) {
  fail("DriverCashAdvancesReverseSection must use formatUsdCents for requests and formatUsd for advances");
}
if (/requested_amount_cents[\s\S]{0,40}toFixed\(2\)/.test(cashAdvRev)) {
  fail("DriverCashAdvancesReverseSection must not treat requested_amount_cents as dollars via toFixed");
}
const settleFin = read("apps/frontend/src/components/driver-profile/DriverSettlementFinanceReverseSection.tsx");
if (!/formatUsdCents\(d\.disputed_amount_cents\)/.test(settleFin)) fail("DriverSettlementFinanceReverseSection disputed amount must use formatUsdCents");
if (!/formatUsd\(Number\(l\.current_balance/.test(settleFin)) fail("DriverSettlementFinanceReverseSection liability balance must use formatUsd");
const disputeList = read("apps/frontend/src/pages/drivers/SettlementDisputeList.tsx");
if (!/formatUsdCents\(cents \?\? 0\)/.test(disputeList)) fail("SettlementDisputeList must use formatUsdCents");
const totals = read("apps/frontend/src/components/forms/shared/TotalsStack.tsx");
if (!/formatUsd\(subtotal\)/.test(totals) || !/formatUsd\(total\)/.test(totals)) fail("TotalsStack must use formatUsd");
const chat = read("apps/frontend/src/pages/chat/DispatchChatPage.tsx");
if (!/formatUsdCents\(m\.cash_advance_amount_cents\)/.test(chat)) fail("DispatchChatPage cash advance card must use formatUsdCents");
const costs = read("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx");
if (!/formatUsdRateTable\(Number\(cents\) \/ 100\)/.test(costs)) fail("LoadDetailCostsTab fmtRate must use formatUsdRateTable");


const loadCosts = read("apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx");
if (!/formatUsdRateTable\(Number\(c\) \/ 100\)/.test(loadCosts)) fail("LoadCostsBoardPage fmtRate must use formatUsdRateTable");
const escrow = read("apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx");
if (/\$\{Number\(driverEscrowBalance/.test(escrow) || /\$\{filteredTotal\.toFixed/.test(escrow)) {
  fail("DriverEscrowLedgerSection balance tiles must use formatUsd");
}
const liab = read("apps/frontend/src/pages/liabilities/components/LiabilitiesKpiRow.tsx");
if (!/formatUsd\(n\)/.test(liab) || /\$\$\{n\.toFixed\(2\)\}/.test(liab)) fail("LiabilitiesKpiRow must use formatUsd");
const tourRates = read("apps/frontend/src/components/dispatch/TourSettlementTab.tsx");
if (!/formatUsdRateTable\(rt, 3\)/.test(tourRates)) fail("TourSettlementTab leg rate must use formatUsdRateTable(..., 3)");
if (!/formatUsdRateTable\(c \/ 100 \/ totalMiles, 3\)/.test(tourRates)) {
  fail("TourSettlementTab waterfall p/m must use formatUsdRateTable(..., 3)");
}
if (!/formatDateUS\(d\)/.test(tourRates) || !/formatDateTimeUS\(t\.trip_closed_at\)/.test(tourRates)) {
  fail("TourSettlementTab period/closed stamps must use formatDateUS/formatDateTimeUS");
}

const unitSplit = read("apps/frontend/src/components/dispatch/LoadUnitCostSplitPanel.tsx");
if (!/formatQuantityTable\(u\.miles\)/.test(unitSplit) || !/formatQuantityTable\(data\.total_miles\)/.test(unitSplit)) {
  fail("LoadUnitCostSplitPanel miles must use formatQuantityTable");
}
if (/u\.miles\.toFixed\(1\)/.test(unitSplit) || /data\.total_miles\.toFixed\(1\)/.test(unitSplit)) {
  fail("LoadUnitCostSplitPanel must not hand-roll miles toFixed(1)");
}

const deadhead = read("apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx");
if (!/formatQuantityTable\(n\)/.test(deadhead)) fail("DeadheadOptimizerPanel miles must use formatQuantityTable");
if (!/formatQuantityTable\(row\.score, 2\)/.test(deadhead)) fail("DeadheadOptimizerPanel score must use formatQuantityTable");
if (/n\.toFixed\(1\)/.test(deadhead)) fail("DeadheadOptimizerPanel must not hand-roll miles toFixed(1)");
const optimalDrivers = read("apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx");
if (!/formatQuantityTable\(n, 0\)/.test(optimalDrivers)) fail("OptimalDriversPanel scores must use formatQuantityTable");
if (/n\.toFixed\(0\)/.test(optimalDrivers)) fail("OptimalDriversPanel must not hand-roll score toFixed(0)");
if (!/formatQuantityTable\(\(c \/ invoicedCents\) \* 100, 2\)/.test(tourSettle)) fail("TourSettlementTab pct must use formatQuantityTable");
if (!/formatQuantityTable\(tot\.margin_pct, 1\)/.test(tourSettle)) fail("TourSettlementTab margin % must use formatQuantityTable");
const tourPre = read("apps/frontend/src/components/dispatch/TourPreSettlementTab.tsx");
if (!/formatQuantityTable\(p, 1\)/.test(tourPre)) fail("TourPreSettlementTab pct must use formatQuantityTable");
const loadDetailCosts = read("apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx");
if (!/formatQuantityTable\(\(margin \/ revenue\) \* 100, 1\)/.test(loadDetailCosts)) fail("LoadDetailCostsTab margin % must use formatQuantityTable");
const tourLoadRows = read("apps/frontend/src/components/dispatch/TourLoadRows.tsx");
if (!/formatQuantityTable\(r\.load_margin_pct, 1\)/.test(tourLoadRows)) fail("TourLoadRows margin % must use formatQuantityTable");
const settleProfit = read("apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx");
if (!/formatQuantityTable\(d\.margin_pct, 1\)/.test(settleProfit)) fail("SettlementProfitabilityCard margin % must use formatQuantityTable");

const detention = read("apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx");
if (!/formatQuantityTable\(Number\(event\.billable_minutes/.test(detention)) {
  fail("DetentionBoardPage billable minutes must use formatQuantityTable");
}
const gpsBorder = read("apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx");
if (!/formatQuantityTable\(ev\.customs_clearance_minutes\)/.test(gpsBorder)) {
  fail("GPS BorderCrossingHistory customs minutes must use formatQuantityTable");
}
const faro1090 = read("apps/frontend/src/pages/factoring/Faro1090WireProposalsPage.tsx");
if (!/formatQuantityTable\(row\.days_unfunded\)/.test(faro1090)) {
  fail("Faro1090WireProposalsPage days_unfunded must use formatQuantityTable");
}
if (!/formatUsdCents\(Math\.abs\(c\.amount_delta_cents\)\)/.test(faro1090)) {
  fail("Faro1090WireProposalsPage amount_delta must use formatUsdCents (not raw ¢)");
}
if (/Δ\$\{c\.amount_delta_cents\}¢/.test(faro1090)) {
  fail("Faro1090WireProposalsPage must not render raw amount_delta_cents with ¢ suffix");
}
const financeHub = read("apps/frontend/src/pages/finance/FinanceHubPage.tsx");
if (!/formatQuantityTable\(Number\(kpi\.value\) \|\| 0\)/.test(financeHub)) {
  fail("FinanceHubPage count KPIs must use formatQuantityTable");
}
if (/Intl\.NumberFormat\("en-US"\)\.format\(Number\(kpi\.value\)/.test(financeHub)) {
  fail("FinanceHubPage must not use Intl.NumberFormat for count KPIs");
}
const factoringQueue = read("apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx");
if (!/MXN \$\{formatQuantityTable\(\(Number\(cents\) \|\| 0\) \/ 100, 2\)\}/.test(factoringQueue)) {
  fail("FactoringQueuePage MXN amounts must use formatQuantityTable (not Intl money)");
}
if (/Intl\.NumberFormat\("es-MX"/.test(factoringQueue)) {
  fail("FactoringQueuePage must not use Intl.NumberFormat es-MX for money");
}
const settleProfitCard = read("apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx");
if (!/MXN \$\{formatQuantityTable\(Number\(cents\) \/ 100, 2\)\}/.test(settleProfitCard)) {
  fail("SettlementProfitabilityCard MXN must use formatQuantityTable");
}
if (/Intl\.NumberFormat\("es-MX"/.test(settleProfitCard)) {
  fail("SettlementProfitabilityCard must not use Intl.NumberFormat es-MX for money");
}
const dispatchMoney = read("apps/frontend/src/components/dispatch/constants.ts");
if (!/MXN \$\{formatQuantityTable\(Number\(valueCents\) \/ 100, 2\)\}/.test(dispatchMoney)) {
  fail("dispatch/constants formatMoneyCents MXN must use formatQuantityTable");
}
if (!/MXN \$\{formatQuantityTable\(Number\(valueDollars\), 2\)\}/.test(dispatchMoney)) {
  fail("dispatch/constants formatMoneyDollars MXN must use formatQuantityTable");
}
if (/Intl\.NumberFormat\("es-MX"/.test(dispatchMoney)) {
  fail("dispatch/constants must not use Intl.NumberFormat es-MX for money");
}
const loadProfit = read("apps/frontend/src/lib/loadProfit.ts");
if (!/formatUsdCents\(cents\)\.replace/.test(loadProfit)) {
  fail("loadProfit formatProfitCents must use formatUsdCents for sub-$1k badges");
}
if (/Intl\.NumberFormat\("en-US"[\s\S]*style:\s*["']currency["']/.test(loadProfit)) {
  fail("loadProfit must not hand-roll Intl.NumberFormat currency");
}
const bulkLabels = read("apps/frontend/src/components/bulk/bulkRowLabels.ts");
if (!/formatUsdCents\(cents\)/.test(bulkLabels)) {
  fail("bulkRowLabels money() must use formatUsdCents");
}
if (/Intl\.NumberFormat/.test(bulkLabels)) {
  fail("bulkRowLabels must not use Intl.NumberFormat");
}
const propertyTax = read("apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx");
if (!/formatQuantityTable\(rendition\.assessed_tax_cents \/ 100, 2\)/.test(propertyTax)) {
  fail("PropertyTaxRenditionPage assessed MoneyInput placeholder must use formatQuantityTable");
}
if (/\(rendition\.assessed_tax_cents \/ 100\)\.toFixed\(2\)/.test(propertyTax)) {
  fail("PropertyTaxRenditionPage must not use toFixed for assessed tax placeholder");
}
const driverLayover = read("apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx");
if (!/formatQuantityTable\(row\.duration_hours, 1\)/.test(driverLayover)) {
  fail("DriverLayoverHistory duration hours must use formatQuantityTable");
}
const driverProfile = read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx");
if (!/formatQuantityTable\(totalHours, 1\)/.test(driverProfile)) {
  fail("DriverProfilePage layover total hours must use formatQuantityTable");
}
const cargoTemp = read("apps/frontend/src/components/dispatch/CargoTempBadge.tsx");
if (!/formatQuantityTable\(latest\.temp_celsius, 1\)/.test(cargoTemp)) {
  fail("CargoTempBadge temp must use formatQuantityTable");
}
const profitMoney = read("apps/frontend/src/pages/profitability/money.ts");
if (!/export function pctLabel/.test(profitMoney) || !/formatQuantityTable\(n, 1\)/.test(profitMoney)) {
  fail("profitability money.ts pctLabel must use formatQuantityTable");
}
const byLoad = read("apps/frontend/src/pages/profitability/ByLoadView.tsx");
if (!/pctLabel\(row\.margin_pct\)/.test(byLoad)) fail("ByLoadView margin % must use pctLabel");
const byCust = read("apps/frontend/src/pages/profitability/ByCustomerView.tsx");
if (!/pctLabel\(row\.gross_margin_pct\)/.test(byCust)) fail("ByCustomerView margin % must use pctLabel");
const forensic = read("apps/frontend/src/pages/forensic/ForensicReviewPage.tsx");
if (!/formatUsdCents\(Number\(anomaly\.total_cents/.test(forensic)) {
  fail("ForensicReviewPage anomaly total must use formatUsdCents");
}
const fleetGauge = read("apps/frontend/src/pages/home/charts/FleetUtilizationGauge.tsx");
if (!/formatQuantityTable\(pct, 1\)/.test(fleetGauge)) fail("FleetUtilizationGauge pct must use formatQuantityTable");
if (!/formatQuantityTable\(s \/ 3600, 1\)/.test(driverHub)) fail("DriverHubReportingPage hours must use formatQuantityTable");
const ownerHome = read("apps/frontend/src/pages/home/OwnerHome.tsx");
if (!/formatQuantityTable\(Math\.abs\(tr\.delta_pct_vs_yesterday\), 1\)/.test(ownerHome)) {
  fail("OwnerHome delta pct must use formatQuantityTable");
}
const defaultHome = read("apps/frontend/src/pages/home/roles/DefaultHome.tsx");
if (!/formatQuantityTable\(Math\.abs\(tr\.delta_pct_vs_yesterday\), 1\)/.test(defaultHome)) {
  fail("DefaultHome delta pct must use formatQuantityTable");
}
const qboHome = read("apps/frontend/src/pages/home/QboStyleHomePage.tsx");
if (!/formatQuantityTable\(pct, 1\)/.test(qboHome)) fail("QboStyleHomePage fmtPct must use formatQuantityTable");
const custFactor = read("apps/frontend/src/components/customers/CustomerFactoringReverseSection.tsx");
if (!/formatQuantityTable\(factor\.advance_rate \* 100, 1\)/.test(custFactor) || !/formatQuantityTable\(factor\.fee_rate \* 100, 1\)/.test(custFactor)) {
  fail("CustomerFactoringReverseSection rates must use formatQuantityTable");
}
const custLate = read("apps/frontend/src/components/customers/CustomerLateArrivalCard.tsx");
if (!/formatQuantityTable\(rate \* 100, 1\)/.test(custLate)) fail("CustomerLateArrivalCard pct must use formatQuantityTable");
const drvLate = read("apps/frontend/src/components/drivers/DriverLateArrivalCard.tsx");
if (!/formatQuantityTable\(rate \* 100, 1\)/.test(drvLate)) fail("DriverLateArrivalCard pct must use formatQuantityTable");
const dpStops = read("apps/frontend/src/components/driver-profile/DriverProfileStopsMilesSection.tsx");
if (!/formatQuantityTable\(row\.odometer_mi, 1\)/.test(dpStops) || !/formatQuantityTable\(readMiles, 1\)/.test(dpStops)) {
  fail("DriverProfileStopsMilesSection miles must use formatQuantityTable");
}
const stopsMiles = read("apps/frontend/src/components/shared/StopsMilesSection.tsx");
if (!/formatQuantityTable\(row\.odometer_mi, 1\)/.test(stopsMiles)) fail("StopsMilesSection odometer must use formatQuantityTable");
const dispPerf = read("apps/frontend/src/components/dispatchers/DispatcherPerformanceCard.tsx");
if (!/formatQuantityTable\(data\.avg_gap_hours, 1\)/.test(dispPerf)) fail("DispatcherPerformanceCard gap hours must use formatQuantityTable");
const daySum = read("apps/frontend/src/components/home/DriverDaySummaryCard.tsx");
if (!/formatQuantityTable\(row\.miles, 1\)/.test(daySum) || !/formatQuantityTable\(row\.hours_on_duty, 2\)/.test(daySum)) {
  fail("DriverDaySummaryCard miles/hours must use formatQuantityTable");
}
const relScore = read("apps/frontend/src/components/customers/CustomerRelationshipScore.tsx");
if (!/formatQuantityTable\(value, 1\)/.test(relScore) || !/formatQuantityTable\(score\.overall_health_score, 1\)/.test(relScore)) {
  fail("CustomerRelationshipScore must use formatQuantityTable");
}
const atRisk = read("apps/frontend/src/components/drivers/AtRiskDriverCard.tsx");
if (!/formatQuantityTable\(riskScore, 1\)/.test(atRisk)) fail("AtRiskDriverCard risk score must use formatQuantityTable");
const ledgerKpi = read("apps/frontend/src/components/shared/LedgerKpiPanel.tsx");
if (!/formatQuantityTable\(k\.value, 2\)/.test(ledgerKpi) || !/formatQuantityTable\(v, 2\)/.test(ledgerKpi)) {
  fail("LedgerKpiPanel percent must use formatQuantityTable");
}

const weeklyRev = read("apps/frontend/src/pages/home/charts/WeeklyRevenueChart.tsx");
if (!/tickFormatter=\{\(v\) => formatUsd\(Number\(v\)\)\}/.test(weeklyRev)) {
  fail("WeeklyRevenueChart Y-axis must use formatUsd");
}

const custList = read("apps/frontend/src/pages/customers/CustomersListView.tsx");
if (!/formatQuantityTable\(value, 1\)/.test(custList)) fail("CustomersListView pct must use formatQuantityTable");
const fleetHos = read("apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx");
if (!/formatQuantityTable\(v, digits\)/.test(fleetHos)) fail("FleetHosBoardSection num must use formatQuantityTable");
const form2290 = read("apps/frontend/src/pages/compliance/Form2290Filings.tsx");
if (!/formatUsd\(Number\(filing\.total_tax_due/.test(form2290)) fail("Form2290Filings tax due must use formatUsd");
const breakEven = read("apps/frontend/src/pages/finance/BreakEvenPage.tsx");
if (!/formatUsdRateTable\(centsPerMile \/ 100, 3\)/.test(breakEven)) fail("BreakEvenPage per-mile must use formatUsdRateTable");
if (!/formatQuantityTable\(Math\.round\(n \|\| 0\), 0\)/.test(breakEven)) fail("BreakEvenPage fmtInt must use formatQuantityTable");
const breakEvenWb = read("apps/frontend/src/pages/finance/BreakEvenWorkbookCreator.tsx");
if (!/formatUsdRateTable\(preview\.total_cost_per_mile_cents \/ 100, 3\)/.test(breakEvenWb)) {
  fail("BreakEvenWorkbookCreator preview per-mile must use formatUsdRateTable");
}
const eldUnid = read("apps/frontend/src/pages/eld/tabs/UnidentifiedTab.tsx");
if (!/formatQuantityTable\(Number\(speed\), 0\)/.test(eldUnid)) fail("UnidentifiedTab speed must use formatQuantityTable");

const amort = read("apps/frontend/src/pages/finance/AmortizationPage.tsx");
if (!/formatQuantityTable\(l\.interest_rate_bps \/ 100, 2\)/.test(amort)) fail("AmortizationPage interest rate must use formatQuantityTable");
const form425 = read("apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx");
if (!/return formatUsd\(nv\(s\)\)/.test(form425)) fail("Form425c CurrentPeriodTab moneyCell must use formatUsd");
const qbImport = read("apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx");
if (!/formatUsd\(row\.amt\)/.test(qbImport) || !/formatUsd\(includedTotal\)/.test(qbImport)) {
  fail("Form425c QBImportTab amounts must use formatUsd");
}

const featureFlags = read("apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx");
if (!/formatQuantityTable\(Number\(row\.rollout_pct \?\? 0\), 0\)/.test(featureFlags)) {
  fail("FeatureFlagsManager rollout % must use formatQuantityTable");
}

const markDisb = read("apps/frontend/src/pages/cash-advances/components/MarkDisbursedModal.tsx");
if (!/formatUsdCents\(Math\.abs\(Number\(tx\.amount_cents/.test(markDisb)) {
  fail("MarkDisbursedModal bank txn labels must use formatUsdCents");
}
const manualJe = read("apps/frontend/src/pages/accounting/ManualJEListPage.tsx");
if (!/formatUsdCents\(entry\.debit_total_cents/.test(manualJe) || !/formatUsdCents\(entry\.credit_total_cents/.test(manualJe)) {
  fail("ManualJEListPage Debits/Credits must use formatUsdCents");
}

const retention = read("apps/frontend/src/pages/drivers/RetentionDashboard.tsx");
if (!/formatQuantityTable\(lateArrivalRate \* 100, 1\)/.test(retention)) {
  fail("RetentionDashboard late arrival rate must use formatQuantityTable");
}
const vendorMap = read("apps/frontend/src/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx");
if (!/formatQuantityTable\(row\.similarity_score, 3\)/.test(vendorMap)) {
  fail("VendorMappingResolutionPage similarity score must use formatQuantityTable");
}


const factoringHome = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
if (!/formatQuantityTable\(row\.age, 0\)/.test(factoringHome)) {
  fail("FactoringHome aging/fees Age must use formatQuantityTable(, 0)");
}
if ((factoringHome.match(/formatQuantityTable\(row\.age, 0\)/g) || []).length < 2) {
  fail("FactoringHome must format Age on fees-paid and aging tables");
}
if (!/formatQuantityTable\(activeFactor\.recourse_days, 0\)/.test(factoringHome)) {
  fail("FactoringHome recourse_days must use formatQuantityTable(, 0)");
}
const factoringBoard = read("apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx");
if (!/formatQuantityTable\(activeFactor\.recourse_days, 0\)/.test(factoringBoard)) {
  fail("FactoringHomeBoard recourse_days must use formatQuantityTable(, 0)");
}
if (!/formatQuantityTable\(Number\(summary\?\.recourse_days \?\? 95\), 0\)/.test(factoringBoard)) {
  fail("FactoringHomeBoard summary recourse_days must use formatQuantityTable(, 0)");
}
const unitsNoLoad = read("apps/frontend/src/pages/dispatch/components/UnitsWithoutLoadTable.tsx");
if (!/formatQuantityTable\(row\.hours_since_last_delivery, 0\)/.test(unitsNoLoad)) {
  fail("UnitsWithoutLoadTable hours must use formatQuantityTable(, 0)");
}
const dispOverview = read("apps/frontend/src/pages/dispatch/DispatchOverview.tsx");
if (!/formatQuantityTable\(Math\.floor\(unit\.hours_since_last_delivery \/ 24\), 0\)/.test(dispOverview)) {
  fail("DispatchOverview daysIdle must use formatQuantityTable(, 0)");
}
const dmHome = read("apps/frontend/src/pages/home/roles/DriverManagerHome.tsx");
if (!/formatQuantityTable\(row\.days_idle, 0\)/.test(dmHome)) {
  fail("DriverManagerHome days_idle must use formatQuantityTable(, 0)");
}
const fleetRestore = read("apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx");
if (!/formatQuantityTable\(Math\.round\(data\.avg_days_open\), 0\)/.test(fleetRestore)) {
  fail("HomeFleetRestoreCard avg_days_open must use formatQuantityTable(, 0)");
}
const custDetailAge = read("apps/frontend/src/pages/CustomerDetail.tsx");
if (!/formatQuantityTable\(event\.days_late, 0\)/.test(custDetailAge)) {
  fail("CustomerDetail quality days_late must use formatQuantityTable(, 0)");
}
const cardOverage = read("apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx");
if (!/formatQuantityTable\(row\.gallons, 1\)/.test(cardOverage) || !/formatQuantityTable\(row\.gallon_limit, 1\)/.test(cardOverage)) {
  fail("CardOverageQueuePage gallons must use formatQuantityTable");
}
const insHome = read("apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx");
if (!/formatQuantityTable\(renewal\.days, 0\)/.test(insHome)) {
  fail("InsuranceHomeBoard renewal days must use formatQuantityTable(, 0)");
}


const rollingDays = read("apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx");
if (!/formatQuantityTable\(row\.days_overdue, 0\)/.test(rollingDays)) {
  fail("RollingLedgerTab days_overdue must use formatQuantityTable(, 0)");
}
const form2290Days = read("apps/frontend/src/pages/compliance/Form2290Filings.tsx");
if (!/formatQuantityTable\(deadline\.days_remaining, 0\)/.test(form2290Days)) {
  fail("Form2290Filings days_remaining must use formatQuantityTable(, 0)");
}
const custTerms = read("apps/frontend/src/components/customers/CustomerProfileForm.tsx");
if (!/formatQuantityTable\(t\.days_until_due, 0\)/.test(custTerms)) {
  fail("CustomerProfileForm terms days_until_due must use formatQuantityTable(, 0)");
}
const recourseDays = read("apps/frontend/src/components/customers/CustomerFactoringRecourseReverseSection.tsx");
if (!/formatQuantityTable\(row\.days_until_recourse_expiry, 0\)/.test(recourseDays)) {
  fail("CustomerFactoringRecourseReverseSection days must use formatQuantityTable(, 0)");
}


const factoringWires = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
if (!/formatQuantityTable\(purchaseEscrowTotals\.count, 0\)/.test(factoringWires)) {
  fail("FactoringHome escrow wire count must use formatQuantityTable(, 0)");
}
const coSettleMpg = read("apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx");
if (!/formatQuantityTable\(report\.sections\.miles_and_mpg\.mpg, 1\)/.test(coSettleMpg)) {
  fail("CompanySettlementsPage MPG must use formatQuantityTable(, 1)");
}
const awaitingBol = read("apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx");
if (!/formatQuantityTable\(queueQ\.data\.count, 0\)/.test(awaitingBol)) {
  fail("AwaitingBolInvoicePage API count must use formatQuantityTable(, 0)");
}
if (!/formatQuantityTable\(rows\.length, 0\)/.test(awaitingBol)) {
  fail("AwaitingBolInvoicePage row count must use formatQuantityTable(, 0)");
}


const breakEvenDays = read("apps/frontend/src/pages/finance/BreakEvenPage.tsx");
if (!/formatQuantityTable\(model\.days, 0\)/.test(breakEvenDays)) {
  fail("BreakEvenPage model.days must use formatQuantityTable(, 0)");
}
const fleetRestoreUnits = read("apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx");
if (!/formatQuantityTable\(data\.unit_count, 0\)/.test(fleetRestoreUnits)) {
  fail("HomeFleetRestoreCard unit_count must use formatQuantityTable(, 0)");
}
const factoringSettings = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
if (!/formatQuantityTable\(Number\(settingsQuery\.data\?\.current\?\.active_factor_count/.test(factoringSettings)) {
  fail("FactoringHome active_factor_count must use formatQuantityTable");
}
if (!/formatQuantityTable\(Number\(settingsQuery\.data\?\.current\?\.recourse_days/.test(factoringSettings)) {
  fail("FactoringHome settings recourse_days must use formatQuantityTable");
}


const settleShare = read("apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx");
if (!/formatQuantityTable\(Number\(split\.share_pct \?\? 0\), 1\)/.test(settleShare)) {
  fail("SettlementStatementWorkflowPage share % must use formatQuantityTable(, 1)");
}
const factorMtd = read("apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx");
if (!/formatQuantityTable\(Number\(summary\.mtd_advances_count \?\? 0\), 0\)/.test(factorMtd)) {
  fail("FactoringHomeBoard mtd_advances_count must use formatQuantityTable(, 0)");
}


const factorUncleared = read("apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx");
if (!/formatQuantityTable\(unclearedWireCount, 0\)/.test(factorUncleared)) {
  fail("FactoringHomeBoard unclearedWireCount must use formatQuantityTable(, 0)");
}


const legalAlertsKpi = read("apps/frontend/src/pages/legal/alerts/LegalDeadlineAlertsPage.tsx");
if ((legalAlertsKpi.match(/formatQuantityTable\(summary\?\.(total|critical|warning|overdue) \?\? 0, 0\)/g) || []).length < 4) {
  fail("LegalDeadlineAlertsPage KPIs must use formatQuantityTable(, 0)");
}


const tripPair = read("apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx");
if ((tripPair.match(/formatQuantityTable\(data\.kpis\.[a-z0-9_]+, 0\)/g) || []).length < 6) {
  fail("TripPairingBoardPage KPIs must use formatQuantityTable(, 0)");
}
if (!/formatQuantityTable\(unbooked\.length, 0\)/.test(tripPair) || !/formatQuantityTable\(tours\.length, 0\)/.test(tripPair)) {
  fail("TripPairingBoardPage section badges must use formatQuantityTable(, 0)");
}

const submitFactor = read("apps/frontend/src/pages/factoring/SubmitToFactorTab.tsx");
if (!/formatQuantityTable\(totals\.count, 0\)/.test(submitFactor)) {
  fail("SubmitToFactorTab invoice count must use formatQuantityTable(, 0)");
}

const factorHomeQty = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
if (!/formatQuantityTable\(agingRows\.length, 0\)/.test(factorHomeQty)) {
  fail("FactoringHome aging total records must use formatQuantityTable(, 0)");
}
if (!/formatQuantityTable\(filtered\.length, 0\)/.test(factorHomeQty)) {
  fail("FactoringHome Faro batches KPI must use formatQuantityTable(, 0)");
}

const batchWizard = read("apps/frontend/src/pages/factoring/BatchWizard.tsx");
if (!/formatQuantityTable\(draftBatch\.invoice_ids\.length, 0\)/.test(batchWizard)) {
  fail("BatchWizard invoice count must use formatQuantityTable(, 0)");
}

const batchDetail = read("apps/frontend/src/pages/factoring/BatchDetail.tsx");
if (!/formatQuantityTable\(detail\.invoices\.length, 0\)/.test(batchDetail)) {
  fail("BatchDetail included invoices must use formatQuantityTable(, 0)");
}


const factorQueueQty = read("apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx");
if (!/formatQuantityTable\(count, 0\)/.test(factorQueueQty)) {
  fail("FactoringQueuePage stage badge counts must use formatQuantityTable(, 0)");
}
if (!/formatQuantityTable\(filtered\.length, 0\)/.test(factorQueueQty) || !/formatQuantityTable\(rows\.length, 0\)/.test(factorQueueQty)) {
  fail("FactoringQueuePage showing X of Y must use formatQuantityTable(, 0)");
}


const coverageGapQty = read("apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx");
if ((coverageGapQty.match(/formatQuantityTable\(summary\.expiring(?:30|60|90)\.length, 0\)/g) || []).length < 3) {
  fail("CoverageGapDashboard expiry KPIs must use formatQuantityTable(, 0)");
}

const loadsWithoutTour = read("apps/frontend/src/pages/dispatch/LoadsWithoutTourPage.tsx");
if (!/formatQuantityTable\(loads\.length, 0\)/.test(loadsWithoutTour)) {
  fail("LoadsWithoutTourPage row count must use formatQuantityTable(, 0)");
}

const loadsWithoutBill = read("apps/frontend/src/pages/dispatch/LoadsWithoutDriverBillPage.tsx");
if (!/formatQuantityTable\(loads\.length, 0\)/.test(loadsWithoutBill)) {
  fail("LoadsWithoutDriverBillPage row count must use formatQuantityTable(, 0)");
}

const atRiskQty = read("apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx");
if ((atRiskQty.match(/formatQuantityTable\(loads\.length, 0\)/g) || []).length < 2) {
  fail("AtRiskQueuePage footer + drill count must use formatQuantityTable(, 0)");
}

const needsAuthQty = read("apps/frontend/src/pages/dispatch/NeedsDeliveryAuthorizationPage.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(needsAuthQty)) {
  fail("NeedsDeliveryAuthorizationPage count must use formatQuantityTable(, 0)");
}

const fuelGlQty = read("apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx");
if (!/formatQuantityTable\(mappedCount, 0\)/.test(fuelGlQty) || !/formatQuantityTable\(coverage\.length, 0\)/.test(fuelGlQty)) {
  fail("FuelGlMappingCoverage mapped summary must use formatQuantityTable(, 0)");
}


const borderCrossQty = [
  "apps/frontend/src/components/dispatch/drawer-tabs/CustomsTab.tsx",
  "apps/frontend/src/components/dispatch/DriverBorderCrossingsReverseSection.tsx",
  "apps/frontend/src/components/dispatch/UnitBorderCrossingsReverseSection.tsx",
  "apps/frontend/src/components/dispatch/VendorBorderCrossingsReverseSection.tsx",
];
for (const rel of borderCrossQty) {
  const src = read(rel);
  if (!/formatQuantityTable\(rows\.length, 0\)/.test(src)) {
    fail(`${rel} border crossing count must use formatQuantityTable(, 0)`);
  }
}
const timelineQty = read("apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx");
if (!/formatQuantityTable\(unassignedLoads\.length, 0\)/.test(timelineQty)) {
  fail("UnifiedTimelinePlanner unassigned count must use formatQuantityTable(, 0)");
}


const inTransitLoad = read("apps/frontend/src/components/dispatch/LoadInTransitIssuesReverseSection.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(inTransitLoad)) {
  fail("LoadInTransitIssuesReverseSection count must use formatQuantityTable(, 0)");
}
const companySettleQty = read("apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx");
if (!/formatQuantityTable\(v\.length, 0\)/.test(companySettleQty)) {
  fail("CompanySettlementsPage footer Totals must use formatQuantityTable(, 0)");
}
if (!/toursQuery\.isPending[\s\S]{0,80}formatQuantityTable\(allTourRows\.length, 0\)/.test(companySettleQty)) {
  fail("CompanySettlementsPage Closed tours KPI must show … while pending (never flash 0) — #160");
}
if (!/formatQuantityTable\(withCompany, 0\)/.test(companySettleQty) || !/formatQuantityTable\(notOpened, 0\)/.test(companySettleQty)) {
  fail("CompanySettlementsPage with-company/not-opened KPIs must use formatQuantityTable(, 0)");
}
const settleToursQty = read("apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx");
if (!/formatQuantityTable\(v\.length, 0\)/.test(settleToursQty)) {
  fail("SettlementsToursRegister footer Totals must use formatQuantityTable(, 0)");
}


const truckLeaseQty = read("apps/frontend/src/pages/legal/contracts/TruckLeaseCreatorModal.tsx");
if (!/formatQuantityTable\(vehicles\.length, 0\)/.test(truckLeaseQty)) {
  fail("TruckLeaseCreatorModal vehicles count must use formatQuantityTable(, 0)");
}
const mapViewQty = read("apps/frontend/src/pages/dispatch/MapView.tsx");
if (!/formatQuantityTable\(focused\.length, 0\)/.test(mapViewQty)) {
  fail("MapView focused count must use formatQuantityTable(, 0)");
}
const roundTripsQty = read("apps/frontend/src/pages/dispatch/RoundTrips.tsx");
if (!/formatQuantityTable\(deliveredCount, 0\)/.test(roundTripsQty) || !/formatQuantityTable\(legs\.length, 0\)/.test(roundTripsQty)) {
  fail("RoundTrips delivered count must use formatQuantityTable(, 0)");
}

const fleetHomeQty = read("apps/frontend/src/pages/fleet/FleetHomePage.tsx");
if (!/formatQuantityTable\(trailers\.length, 0\)/.test(fleetHomeQty) || !/formatQuantityTable\(mdUnits\.length, 0\)/.test(fleetHomeQty)) {
  fail("FleetHomePage trailers/units counts must use formatQuantityTable(, 0)");
}
const dispatchListQty = read("apps/frontend/src/components/dispatch/DispatchList.tsx");
if ((dispatchListQty.match(/formatQuantityTable\(from, 0\)/g) || []).length < 2) {
  fail("DispatchList Showing from-to-of must use formatQuantityTable(, 0)");
}
const settlementsQty = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
if (!/formatQuantityTable\(settlements\.length, 0\)/.test(settlementsQty) || !/formatQuantityTable\(cancelledHiddenCount, 0\)/.test(settlementsQty)) {
  fail("SettlementsPage live/cancelled counts must use formatQuantityTable(, 0)");
}
if (!/formatQuantityTable\(Number\(kpis\.drivers_with_debt\), 0\)/.test(settlementsQty) || !/formatQuantityTable\(Number\(kpis\.ytd_settlements \?\? 0\), 0\)/.test(settlementsQty)) {
  fail("SettlementsPage home KPI counts must use formatQuantityTable(, 0)");
}
const fuelHistoryQty = read("apps/frontend/src/pages/fuel/FuelPlannerHome.tsx");
if (!/formatQuantityTable\(fuelHistoryTotal, 0\)/.test(fuelHistoryQty) || !/formatQuantityTable\(fuelHistoryVoidedCount, 0\)/.test(fuelHistoryQty)) {
  fail("Fuel History KPI counts must use formatQuantityTable(, 0)");
}
const rollingLedgerQty = read("apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx");
if (!/formatQuantityTable\(driverBillCount, 0\)/.test(rollingLedgerQty) || !/formatQuantityTable\(incomeRows\.length, 0\)/.test(rollingLedgerQty)) {
  fail("RollingLedgerTab income/expense count badges must use formatQuantityTable(, 0)");
}
if (!/ledgerEntityKind\(row\.document_kind, row\)/.test(rollingLedgerQty)) {
  fail("RollingLedgerTab AdjustPopover must pass row into ledgerEntityKind (CASH-T03 legacy fuel-avg)");
}
// Codex batch62 — AdjustPopover-specific: global ledgerEntityKind(, row) elsewhere must not mask a missing consumer arg.
if (!/function AdjustPopover[\s\S]{0,900}ledgerEntityKind\(row\.document_kind, row\)/.test(rollingLedgerQty)) {
  fail("AdjustPopover itself must pass row into ledgerEntityKind (not only sibling renderers)");
}
const tourSettleQty = read("apps/frontend/src/components/dispatch/TourSettlementTab.tsx");
if (!/formatQuantityTable\(bills\.length, 0\)/.test(tourSettleQty) || !/formatQuantityTable\(liveLegs\.length, 0\)/.test(tourSettleQty)) {
  fail("TourSettlementTab bill/load counts must use formatQuantityTable(, 0)");
}
const dispatchBoardQty = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(dispatchBoardQty)) {
  fail("DispatchBoard section badges must use formatQuantityTable(, 0)");
}
const loadBolQty = read("apps/frontend/src/components/dispatch/LoadBolPanel.tsx");
if (!/formatQuantityTable\(pods\.length, 0\)/.test(loadBolQty) || !/formatQuantityTable\(bols\.length, 0\)/.test(loadBolQty)) {
  fail("LoadBolPanel POD/BOL counts must use formatQuantityTable(, 0)");
}

const kanbanQty = read("apps/frontend/src/components/dispatch/DispatchKanban.tsx");
if ((kanbanQty.match(/formatQuantityTable\(loads\.length, 0\)/g) || []).length < 2) {
  fail("DispatchKanban column badges must use formatQuantityTable(, 0)");
}
const preSettleQty = read("apps/frontend/src/components/dispatch/TourPreSettlementTab.tsx");
if (!/formatQuantityTable\(unpostedDraftExpenses\.length, 0\)/.test(preSettleQty) || !/formatQuantityTable\(r\.costs\.length, 0\)/.test(preSettleQty)) {
  fail("TourPreSettlementTab draft/cost counts must use formatQuantityTable(, 0)");
}
const ownerHomeQty = read("apps/frontend/src/pages/home/OwnerHome.tsx");
if (!/formatQuantityTable\(ownerCashPending\.length, 0\)/.test(ownerHomeQty)) {
  fail("OwnerHome pending cash advances must use formatQuantityTable(, 0)");
}
const engineStatusQty = read("apps/frontend/src/pages/system/EngineStatusBoardPage.tsx");
if (!/formatQuantityTable\(redCount, 0\)/.test(engineStatusQty) || !/formatQuantityTable\(rows\.length, 0\)/.test(engineStatusQty)) {
  fail("EngineStatusBoardPage counts must use formatQuantityTable(, 0)");
}
const txHealthQty = read("apps/frontend/src/pages/system/SystemModulePage.tsx");
if ((txHealthQty.match(/formatQuantityTable\((?:failCount|warnCount|rows\.length), 0\)/g) || []).length < 3) {
  fail("Transaction Health KPI counts must use formatQuantityTable(, 0)");
}
const settleLoadsQty = read("apps/frontend/src/pages/driver-finance/components/SettlementLoadsSection.tsx");
if (!/formatQuantityTable\(legs\.length, 0\)/.test(settleLoadsQty)) {
  fail("SettlementLoadsSection leg count must use formatQuantityTable(, 0)");
}
const toursRegQty = read("apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx");
if (!/formatQuantityTable\(filteredRows\.length, 0\)/.test(toursRegQty)) {
  fail("SettlementsToursRegister live count must use formatQuantityTable(, 0)");
}


const tourLegsQty = read("apps/frontend/src/components/dispatch/TourLegsCell.tsx");
if (!/formatQuantityTable\(list\.length, 0\)/.test(tourLegsQty)) {
  fail("TourLegsCell count must use formatQuantityTable(, 0)");
}
const loadTemplatesQty = read("apps/frontend/src/components/dispatch/CustomerLoadTemplatesReverseSection.tsx");
if (!/formatQuantityTable\(preview\.length, 0\)/.test(loadTemplatesQty)) {
  fail("CustomerLoadTemplatesReverseSection Showing must use formatQuantityTable(, 0)");
}
const detentionRevQty = read("apps/frontend/src/components/dispatch/LoadDetentionReverseSection.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(detentionRevQty)) {
  fail("LoadDetentionReverseSection count must use formatQuantityTable(, 0)");
}
const submissionQueueQty = read("apps/frontend/src/pages/factoring/SubmissionQueue.tsx");
if (!/formatQuantityTable\(submittable\.length, 0\)/.test(submissionQueueQty) || !/formatQuantityTable\(items\.length, 0\)/.test(submissionQueueQty)) {
  fail("SubmissionQueue ready counts must use formatQuantityTable(, 0)");
}
const settleHomeQty = read("apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx");
if (!/formatQuantityTable\(weekBuckets\.length, 0\)/.test(settleHomeQty) || !/formatQuantityTable\(weekOfRows\.length, 0\)/.test(settleHomeQty)) {
  fail("SettlementsHomeBoardPanels week counts must use formatQuantityTable(, 0)");
}
const batchSettleQty = read("apps/frontend/src/pages/driver-finance/BatchSettlementsPage.tsx");
if (!/formatQuantityTable\(row\.loads\.length, 0\)/.test(batchSettleQty)) {
  fail("BatchSettlementsPage load counts must use formatQuantityTable(, 0)");
}
const fleetCoveredQty = read("apps/frontend/src/pages/insurance/FleetCoveredPage.tsx");
if (!/formatQuantityTable\(coveredRows\.length, 0\)/.test(fleetCoveredQty)) {
  fail("FleetCoveredPage covered units must use formatQuantityTable(, 0)");
}
const truckPlannerQty = read("apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx");
if (!/formatQuantityTable\(days\.length, 0\)/.test(truckPlannerQty)) {
  fail("TruckPlanner selected days must use formatQuantityTable(, 0)");
}


const factoringHomeQty = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
if (!/formatQuantityTable\(fundsDueRows\.length, 0\)/.test(factoringHomeQty) || !/formatQuantityTable\(agingRows\.length, 0\)/.test(factoringHomeQty)) {
  fail("FactoringHome footer counts must use formatQuantityTable(, 0)");
}
const submitFactorQty = read("apps/frontend/src/pages/factoring/SubmitToFactorTab.tsx");
if (!/formatQuantityTable\(missingDocsRows\.length, 0\)/.test(submitFactorQty)) {
  fail("SubmitToFactorTab missing-docs counts must use formatQuantityTable(, 0)");
}
const remintQty = read("apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(remintQty)) {
  fail("DriverBillRemintScreen load counts must use formatQuantityTable(, 0)");
}
const fuelImportQty = read("apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx");
if (!/formatQuantityTable\(result\.dead_letter_details\.length, 0\)/.test(fuelImportQty)) {
  fail("ImportFuelTransactionsModal dead-letter counts must use formatQuantityTable(, 0)");
}

const relayFillsQty = read("apps/frontend/src/components/fuel/RelayFillsReverseSection.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(relayFillsQty) || !/formatQuantityTable\(totalCount, 0\)/.test(relayFillsQty)) {
  fail("RelayFillsReverseSection Showing must use formatQuantityTable(, 0)");
}
const fuelOverageQty = read("apps/frontend/src/components/fuel/FuelCardOverageReverseSection.tsx");
if (!/formatQuantityTable\(visibleEvents\.length, 0\)/.test(fuelOverageQty) || !/formatQuantityTable\(totalCount, 0\)/.test(fuelOverageQty)) {
  fail("FuelCardOverageReverseSection Showing must use formatQuantityTable(, 0)");
}
const cashForecastQty = read("apps/frontend/src/components/cash-flow/CashForecastReverseSection.tsx");
if (!/formatQuantityTable\(preview\.length, 0\)/.test(cashForecastQty) || !/formatQuantityTable\(entries\.length, 0\)/.test(cashForecastQty)) {
  fail("CashForecastReverseSection Showing must use formatQuantityTable(, 0)");
}
const trainingQty = read("apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx");
if (!/formatQuantityTable\(rows\.length, 0\)/.test(trainingQty) || !/formatQuantityTable\(totalCount, 0\)/.test(trainingQty)) {
  fail("TrainingRecordsSection Showing must use formatQuantityTable(, 0)");
}
const userActivityQty = read("apps/frontend/src/components/users/UserActivityTab.tsx");
if (!/formatQuantityTable\(events\.length, 0\)/.test(userActivityQty) || !/formatQuantityTable\(auditQuery\.data\.total_count, 0\)/.test(userActivityQty)) {
  fail("UserActivityTab Showing must use formatQuantityTable(, 0)");
}
const samsaraMapQty = read("apps/frontend/src/pages/samsara-driver-mapping/SamsaraDriverMappingPage.tsx");
if (!/formatQuantityTable\(rightRows\.length, 0\)/.test(samsaraMapQty) || !/formatQuantityTable\(total, 0\)/.test(samsaraMapQty)) {
  fail("SamsaraDriverMappingPage Showing must use formatQuantityTable(, 0)");
}
const programBoardQty = read("apps/frontend/src/pages/program/ProgramBoardPage.tsx");
if (!/formatQuantityTable\(activeRows\.length, 0\)/.test(programBoardQty) || !/formatQuantityTable\(baseRows\.length, 0\)/.test(programBoardQty)) {
  fail("ProgramBoardPage Showing must use formatQuantityTable(, 0)");
}
const dispPerfLoadsQty = read("apps/frontend/src/components/dispatchers/DispatcherPerformanceCard.tsx");
if (!/formatQuantityTable\(data\.loads_counted \?\? 0, 0\)/.test(dispPerfLoadsQty)) {
  fail("DispatcherPerformanceCard loads_counted must use formatQuantityTable(, 0)");
}
const fleetUtilUnitsQty = read("apps/frontend/src/pages/home/charts/FleetUtilizationGauge.tsx");
if (!/formatQuantityTable\(d\.active_units, 0\)/.test(fleetUtilUnitsQty) || !/formatQuantityTable\(d\.total_units, 0\)/.test(fleetUtilUnitsQty)) {
  fail("FleetUtilizationGauge unit counts must use formatQuantityTable(, 0)");
}
const ownerInvoicesQty = read("apps/frontend/src/pages/home/OwnerHome.tsx");
if (!/formatQuantityTable\(fb\.invoices_factored \?\? 0, 0\)/.test(ownerInvoicesQty)) {
  fail("OwnerHome invoices_factored must use formatQuantityTable(, 0)");
}
const defaultInvoicesQty = read("apps/frontend/src/pages/home/roles/DefaultHome.tsx");
if (!/formatQuantityTable\(fb\.invoices_factored \?\? 0, 0\)/.test(defaultInvoicesQty)) {
  fail("DefaultHome invoices_factored must use formatQuantityTable(, 0)");
}
const custProfileQty = read("apps/frontend/src/components/customers/CustomerProfileOverview.tsx");
if (!/formatQuantityTable\(a\.open_invoice_count, 0\)/.test(custProfileQty)) {
  fail("CustomerProfileOverview open_invoice_count must use formatQuantityTable(, 0)");
}
const submissionSelectedQty = read("apps/frontend/src/pages/factoring/SubmissionQueue.tsx");
if (!/formatQuantityTable\(selected\.length, 0\)/.test(submissionSelectedQty)) {
  fail("SubmissionQueue selected submit count must use formatQuantityTable(, 0)");
}
const submitFactorCreatedQty = read("apps/frontend/src/pages/factoring/SubmitToFactorTab.tsx");
if (!/formatQuantityTable\(created\.purchase\.invoice_count, 0\)/.test(submitFactorCreatedQty)) {
  fail("SubmitToFactorTab created invoice_count must use formatQuantityTable(, 0)");
}
const tourLoadFooterQty = read("apps/frontend/src/components/dispatch/TourLoadRows.tsx");
if (!/formatQuantityTable\(new Set\(v\.map\(r => r\.settlement_id\)\)\.size, 0\)/.test(tourLoadFooterQty) || !/formatQuantityTable\(v\.filter\(r => r\.load_id\)\.length, 0\)/.test(tourLoadFooterQty)) {
  fail("TourLoadRows footer tour/load counts must use formatQuantityTable(, 0)");
}
const legalMattersQty = read("apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx");
if (!/formatQuantityTable\(rangeStart, 0\)/.test(legalMattersQty) || !/formatQuantityTable\(rangeEnd, 0\)/.test(legalMattersQty) || !/formatQuantityTable\(total, 0\)/.test(legalMattersQty)) {
  fail("LegalMattersListPage Showing range must use formatQuantityTable(, 0)");
}
const attorneyReviewQty = read("apps/frontend/src/pages/legal/LegalAttorneyReviewPage.tsx");
if (!/formatQuantityTable\(row\.version, 0\)/.test(attorneyReviewQty)) {
  fail("LegalAttorneyReviewPage version must use formatQuantityTable(, 0)");
}
const legalTemplatesQty = read("apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx");
if (!/formatQuantityTable\(row\.version, 0\)/.test(legalTemplatesQty)) {
  fail("LegalTemplatesListPage version must use formatQuantityTable(, 0)");
}
const legalContractsQty = read("apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx");
if (!/formatQuantityTable\(row\.template_version, 0\)/.test(legalContractsQty) || !/formatQuantityTable\(detailQuery\.data\.template_version, 0\)/.test(legalContractsQty)) {
  fail("LegalContractInstancesPage template_version must use formatQuantityTable(, 0)");
}
const tripPairingDaysQty = read("apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx");
if (!/formatQuantityTable\(t\.up_north_days, 0\)/.test(tripPairingDaysQty)) {
  fail("TripPairingBoardPage up_north_days must use formatQuantityTable(, 0)");
}
const dispatchOverviewIdleQty = read("apps/frontend/src/pages/dispatch/DispatchOverview.tsx");
if (!/formatQuantityTable\(maxDaysIdle, 0\)/.test(dispatchOverviewIdleQty)) {
  fail("DispatchOverview maxDaysIdle must use formatQuantityTable(, 0)");
}
const truckLineDurationQty = read("apps/frontend/src/pages/dispatch/TruckLineBoard.tsx");
if (!/formatQuantityTable\(days, 0\)/.test(truckLineDurationQty) || !/formatQuantityTable\(hours, 0\)/.test(truckLineDurationQty)) {
  fail("TruckLineBoard fmtDuration/fmtHoursMinutes must use formatQuantityTable(, 0)");
}
const reserveTrackerDaysQty = read("apps/frontend/src/pages/factoring/ReserveTracker.tsx");
if (!/formatQuantityTable\(days, 0\)/.test(reserveTrackerDaysQty)) {
  fail("ReserveTracker Next Nd labels must use formatQuantityTable(, 0)");
}
const plannerRangeQty = read("apps/frontend/src/pages/dispatch/planners/PlannerRangeToolbar.tsx");
if (!/formatQuantityTable\(d, 0\)/.test(plannerRangeQty)) {
  fail("PlannerRangeToolbar day chips must use formatQuantityTable(, 0)");
}
const legalTemplateDetailQty = read("apps/frontend/src/pages/legal/templates/LegalTemplateDetailPage.tsx");
if (!/formatQuantityTable\(template\.version, 0\)/.test(legalTemplateDetailQty)) {
  fail("LegalTemplateDetailPage title version must use formatQuantityTable(, 0)");
}
const legalDeadlineDaysQty = read("apps/frontend/src/pages/legal/alerts/LegalDeadlineAlertsPage.tsx");
if (!/formatQuantityTable\(Math\.abs\(days\), 0\)/.test(legalDeadlineDaysQty) || !/formatQuantityTable\(days, 0\)/.test(legalDeadlineDaysQty)) {
  fail("LegalDeadlineAlertsPage daysLabel must use formatQuantityTable(, 0)");
}
const repurchaseDaysQty = read("apps/frontend/src/pages/factoring/RepurchaseDuePanel.tsx");
if (!/formatQuantityTable\(row\.days_since_purchase, 0\)/.test(repurchaseDaysQty)) {
  fail("RepurchaseDuePanel days_since_purchase must use formatQuantityTable(, 0)");
}
const dispatchBoardDaysDownQty = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!/formatQuantityTable\(unit\.days_down, 0\)/.test(dispatchBoardDaysDownQty)) {
  fail("DispatchBoard days_down must use formatQuantityTable(, 0)");
}
const legalSignVersionQty = read("apps/frontend/src/pages/legal/sign/LegalSignPage.tsx");
if (!/formatQuantityTable\(details\.template_version, 0\)/.test(legalSignVersionQty)) {
  fail("LegalSignPage template_version must use formatQuantityTable(, 0)");
}
const attorneyPortalVersionQty = read("apps/frontend/src/pages/legal/attorney-review/LegalAttorneyReviewPortalPage.tsx");
if (!/formatQuantityTable\(details\.version, 0\)/.test(attorneyPortalVersionQty)) {
  fail("LegalAttorneyReviewPortalPage version must use formatQuantityTable(, 0)");
}
const unifiedContractVersionQty = read("apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx");
if (!/formatQuantityTable\(t\.version, 0\)/.test(unifiedContractVersionQty) || !/formatQuantityTable\(selectedTemplate\.version, 0\)/.test(unifiedContractVersionQty)) {
  fail("UnifiedContractCreatorModal version labels must use formatQuantityTable(, 0)");
}
const sendContractVersionQty = read("apps/frontend/src/pages/legal/contracts/SendContractModal.tsx");
if (!/formatQuantityTable\(row\.version, 0\)/.test(sendContractVersionQty)) {
  fail("SendContractModal template version must use formatQuantityTable(, 0)");
}
const accountingHomeCloseQty = read("apps/frontend/src/pages/home/roles/AccountingHome.tsx");
if (!/formatQuantityTable\(days, 0\)/.test(accountingHomeCloseQty)) {
  fail("AccountingHome days_to_close must use formatQuantityTable(, 0)");
}
const settlementDisputesDaysQty = read("apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx");
if (!/formatQuantityTable\(Math\.max\(0, Math\.floor\(\(Date\.now\(\) - new Date\(row\.opened_at\)\.getTime\(\)\) \/ 86400000\)\), 0\)/.test(settlementDisputesDaysQty) || !/formatQuantityTable\(openedDaysAgo, 0\)/.test(settlementDisputesDaysQty)) {
  fail("SettlementDisputesTab opened days must use formatQuantityTable(, 0)");
}
const escrowBoardDaysQty = read("apps/frontend/src/pages/driver-finance/SettlementsEscrowBoard.tsx");
if (!/formatQuantityTable\(ESCROW_RELEASE_WINDOW_DAYS, 0\)/.test(escrowBoardDaysQty)) {
  fail("SettlementsEscrowBoard release window days must use formatQuantityTable(, 0)");
}
const escrowRegisterDaysQty = read("apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx");
if (!/formatQuantityTable\(ESCROW_RELEASE_WINDOW_DAYS, 0\)/.test(escrowRegisterDaysQty)) {
  fail("EscrowRegisterPage release window days must use formatQuantityTable(, 0)");
}
const factoringHomeInvoiceQty = read("apps/frontend/src/pages/factoring/FactoringHome.tsx");
if ((factoringHomeInvoiceQty.match(/formatQuantityTable\(row\.invoice_count, 0\)/g) || []).length < 3) {
  fail("FactoringHome invoice_count columns must use formatQuantityTable(, 0)");
}
const paymentsToYouInvoiceQty = read("apps/frontend/src/pages/factoring/PaymentsToYouPanel.tsx");
if (!/formatQuantityTable\(row\.invoice_count, 0\)/.test(paymentsToYouInvoiceQty)) {
  fail("PaymentsToYouPanel invoice_count must use formatQuantityTable(, 0)");
}
const factoringCashFlowQty = read("apps/frontend/src/pages/factoring/FactoringCashFlowPanel.tsx");
if (!/formatQuantityTable\(row\.wire_count, 0\)/.test(factoringCashFlowQty) || !/formatQuantityTable\(row\.invoice_count, 0\)/.test(factoringCashFlowQty)) {
  fail("FactoringCashFlowPanel wire/invoice counts must use formatQuantityTable(, 0)");
}
const fuelHomeCountQty = read("apps/frontend/src/pages/fuel/FuelHome.tsx");
if (!/formatQuantityTable\(r\.fill_count, 0\)/.test(fuelHomeCountQty) || !/formatQuantityTable\(r\.load_count, 0\)/.test(fuelHomeCountQty)) {
  fail("FuelHome fill/load counts must use formatQuantityTable(, 0)");
}
const fuelDieselCountQty = read("apps/frontend/src/pages/fuel/components/FuelDieselByTruckPanel.tsx");
if (!/formatQuantityTable\(r\.fill_count, 0\)/.test(fuelDieselCountQty) || !/formatQuantityTable\(r\.load_count, 0\)/.test(fuelDieselCountQty)) {
  fail("FuelDieselByTruckPanel fill/load counts must use formatQuantityTable(, 0)");
}
const fuelCardsCountQty = read("apps/frontend/src/pages/fuel/cards/FuelCardsPage.tsx");
if (!/formatQuantityTable\(row\.active_card_count, 0\)/.test(fuelCardsCountQty)) {
  fail("FuelCardsPage active_card_count must use formatQuantityTable(, 0)");
}
const tripProfitSettleQty = read("apps/frontend/src/pages/dispatch/TripProfitability.tsx");
if (!/formatQuantityTable\(t\.settlement_count, 0\)/.test(tripProfitSettleQty)) {
  fail("TripProfitability settlement_count must use formatQuantityTable(, 0)");
}
const dispatchBandQty = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!/formatQuantityTable\(count, 0\)/.test(dispatchBandQty)) {
  fail("DispatchBoard bandTitle count must use formatQuantityTable(, 0)");
}
const fuelBoardKpiQty = read("apps/frontend/src/pages/fuel/components/FuelBoardKpiStrip.tsx");
if (!/formatQuantityTable\(agg\.fill_count, 0\)/.test(fuelBoardKpiQty) || !/formatQuantityTable\(agg\.truck_count, 0\)/.test(fuelBoardKpiQty) || !/formatQuantityTable\(agg\.fills_without_load, 0\)/.test(fuelBoardKpiQty) || !/formatQuantityTable\(openCount, 0\)/.test(fuelBoardKpiQty)) {
  fail("FuelBoardKpiStrip counts must use formatQuantityTable(, 0)");
}
const factoringHomeBoardCountQty = read("apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx");
if (!/formatQuantityTable\(invoiceCount, 0\)/.test(factoringHomeBoardCountQty) || !/formatQuantityTable\(wiresCount, 0\)/.test(factoringHomeBoardCountQty)) {
  fail("FactoringHomeBoard invoice/wire KPI counts must use formatQuantityTable(, 0)");
}
const dispatchOverviewDetentionQty = read("apps/frontend/src/pages/dispatch/DispatchOverview.tsx");
if (!/formatQuantityTable\(detentionQ\.data\?\.count \?\? 0, 0\)/.test(dispatchOverviewDetentionQty) || !/formatQuantityTable\(detentionQ\.data\.active_count, 0\)/.test(dispatchOverviewDetentionQty) || !/formatQuantityTable\(atRiskLateTotal, 0\)/.test(dispatchOverviewDetentionQty) || !/formatQuantityTable\(unitsAvailable, 0\)/.test(dispatchOverviewDetentionQty) || !/formatQuantityTable\(unitsNeedingReturn, 0\)/.test(dispatchOverviewDetentionQty) || !/formatQuantityTable\(exposureLoads\.length, 0\)/.test(dispatchOverviewDetentionQty) || !/formatQuantityTable\(dashboardQ\.data\?\.on_load \?\? 0, 0\)/.test(dispatchOverviewDetentionQty)) {
  fail("DispatchOverview KPI counts must use formatQuantityTable(, 0)");
}
const remintSubtitleQty = read("apps/frontend/src/pages/dispatch/DriverBillRemintScreen.tsx");
if (!/formatQuantityTable\(query\.data\?\.real_count \?\? 0, 0\)/.test(remintSubtitleQty) || !/formatQuantityTable\(query\.data\?\.total_count \?\? 0, 0\)/.test(remintSubtitleQty)) {
  fail("DriverBillRemintScreen subtitle counts must use formatQuantityTable(, 0)");
}
const relayDepositCountQty = read("apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx");
if (!/formatQuantityTable\(countFor\(cls\), 0\)/.test(relayDepositCountQty)) {
  fail("RelayDepositReview deposit counts must use formatQuantityTable(, 0)");
}
const faroImportCountQty = read("apps/frontend/src/pages/factoring/FaroImportPage.tsx");
if (!/formatQuantityTable\(preview\.line_count, 0\)/.test(faroImportCountQty) || !/formatQuantityTable\(commit\.line_count, 0\)/.test(faroImportCountQty)) {
  fail("FaroImportPage line/invoice/reserve counts must use formatQuantityTable(, 0)");
}
const driversKpiQty = read("apps/frontend/src/pages/Drivers.tsx");
if (!/formatQuantityTable\(activeCount, 0\)/.test(driversKpiQty) || !/formatQuantityTable\(allDrivers\.length, 0\)/.test(driversKpiQty) || !/formatQuantityTable\(onLeaveCount, 0\)/.test(driversKpiQty)) {
  fail("Drivers KPI counts must use formatQuantityTable(, 0)");
}
if (!/drivers-need-company/.test(driversKpiQty)) {
  fail("Drivers page must BoardSection need-company when no company selected");
}
const driverHubReportQty = read("apps/frontend/src/pages/home/DriverHubReportingPage.tsx");
if (!/formatQuantityTable\(data\.summary\.total_requests, 0\)/.test(driverHubReportQty) || !/formatQuantityTable\(data\.summary\.approved, 0\)/.test(driverHubReportQty)) {
  fail("DriverHubReportingPage summary counts must use formatQuantityTable(, 0)");
}
const factorCashFlowQty = read("apps/frontend/src/pages/factoring/FactoringCashFlowPanel.tsx");
if (!/formatQuantityTable\(totals\.wires, 0\)/.test(factorCashFlowQty) || !/formatQuantityTable\(totals\.invoices, 0\)/.test(factorCashFlowQty)) {
  fail("FactoringCashFlowPanel wire/invoice counts must use formatQuantityTable(, 0)");
}
const fuelGlMapQty = read("apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx");
if (!/formatQuantityTable\(coverage\.length, 0\)/.test(fuelGlMapQty)) {
  fail("FuelGlMappingCoverage Categories KPI must use formatQuantityTable(, 0)");
}
const avpDaysQty = read("apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx");
if (!/formatQuantityTable\(dayCountInclusive\(applied\.from, applied\.to\), 0\)/.test(avpDaysQty)) {
  fail("ActualVsProjected Days in range must use formatQuantityTable(, 0)");
}

// The regression test exists (renders a no-load row's currency path).
read("apps/frontend/src/components/dispatch/constants.money.test.ts");

console.log("PASS verify-currency-format-guarded");
