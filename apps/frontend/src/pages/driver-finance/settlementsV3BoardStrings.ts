/** ROUND 443.326 — copy for settlements V3 board surfaces (i18n ratchet: .ts not scanned). */

export const S443326 = {
  cashAdvances: {
    errKpiTitle: "Couldn't load cash advance totals",
    kpiOnFile: "Advances on file",
    kpiAwaiting: "Requests awaiting owner",
    kpiOutstanding: "Outstanding to recover",
    kpiRecovered: "Recovered this period",
    kpiRecoveredSub: "Sunday week via settlement recovery",
    searchPlaceholder: "Search advance, driver, load…",
    colDriver: "Driver",
    colAsked: "Asked",
    colAmount: "Amount",
    colPolicy: "Policy",
    colAction: "Action",
    entityDriver: "Driver",
    policyPendingOwner: "Pending owner",
    policyAbove: "Above policy",
    policyWithin: "Within policy",
    review: "Review",
    sectionRequests: "Requests",
    requestsLoadFailed: "Requests failed to load — open View all to retry.",
    emptyRequests: "No requests waiting",
    sectionAdvances: "Advances",
    advancesFooter:
      "Each advance links to its bank line (Zelle) and to the tour that recovers it.",
    errAdvancesTitle: "Couldn't load cash advances",
    emptyAdvances: "No cash advances on file for this company.",
    errDetailTitle: "Couldn't load cash advance details",
  },
  deductions: {
    typeEscrow: "Escrow",
    typeAdvances: "Advances",
    typeFines: "Fines",
    typeDamages: "Damages",
    kpiWeek: "Deductions this week",
    kpiOpenLiab: "Open liabilities",
    kpiDriversDebt: "Drivers w/ debt",
    kpiScheduled: "Scheduled deductions",
    searchPlaceholder: "Search driver or deduction type…",
    newDeduction: "+ New deduction",
    selectCompany: "Select an operating company.",
    sectionByType: "By type · this week",
    thType: "Type",
    thDrivers: "Drivers",
    thAmount: "Amount",
    rowTotal: "Total",
    sectionSchedule: "Schedule",
    scheduleFooter:
      "Every deduction links to its liability, settlement line and journal entry.",
    colDriver: "Driver",
    colType: "Type",
    colPerSettlement: "Per settlement",
    colRemaining: "Remaining",
    colNext: "Next",
    entityDriver: "Driver",
    nextSettlement: "Next settlement",
    emptySchedule: "No active scheduled deductions.",
  },
  preSettlements: {
    kpiTotalUnpaid: "Total unpaid",
    kpiTotalUnpaidSub: "settlements not yet paid",
    kpiThisPeriod: "This period",
    kpiThisPeriodSub: "period end this week",
    kpiDriverPay: "Driver pay (period)",
    kpiDriverPaySubSum: "sum of net pay this period",
    kpiDriverPaySubFlat: "flat vs last wk",
    kpiDriverPaySubUp: "▲ vs last wk",
    kpiDriverPaySubDown: "▼ vs last wk",
    kpiDriversDebt: "Drivers w/ debt",
    kpiDriversDebtSub: "live debt balance",
    kpiYtd: "YTD settlements",
    kpiOpenBills: "Open driver bills",
    kpiOpenBillsSub: "unsettled driver pay",
    searchPlaceholder: "Search driver, unit, load…",
    selectCompany: "Select an operating company.",
    openPanelSubtitle: "open tours · not closed · not paid",
    errLoadTitle: "Couldn't load pre-settlements",
    tableTitle: "Open pre-settlements",
    emptyOpen: "No open pre-settlements for this company.",
    footerTotal: "Total",
    bookedAheadNote: "A booked-ahead load joins the driver's open pre-settlement (443.244).",
  },
} as const;

export function preSettlementsOpenTitle(countLabel: string): string {
  return `Open pre-settlements · ${countLabel}`;
}

export function preSettlementsYtdSub(year: number): string {
  return `${year} calendar year`;
}

export function deductionsWeekSub(settlementCount: number): string {
  return `${settlementCount} settlement${settlementCount === 1 ? "" : "s"}`;
}
