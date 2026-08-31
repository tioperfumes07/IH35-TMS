#!/usr/bin/env node
import fs from "node:fs";

const files = {
  driverHub: "apps/frontend/src/pages/home/DriverHubReportingPage.tsx",
  userDetail: "apps/frontend/src/pages/UserDetail.tsx",
  upload: "apps/frontend/src/components/documents/UploadModal.tsx",
  plannerRange: "apps/frontend/src/pages/dispatch/planners/planner-range.ts",
  plannerRangeContext: "apps/frontend/src/pages/dispatch/planners/PlannerRangeContext.tsx",
  plannerLayout: "apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx",
  plannerCalendar: "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx",
  plannerService: "apps/backend/src/dispatch/planner.service.ts",
  backendBusinessDate: "apps/backend/src/lib/company-business-date.ts",
  dispatchOverview: "apps/frontend/src/pages/dispatch/DispatchOverview.tsx",
  borderHistory: "apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx",
  dispatcherPerformance: "apps/frontend/src/components/dispatchers/DispatcherPerformanceCard.tsx",
  driverTeam: "apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx",
  system: "apps/frontend/src/pages/system/SystemModulePage.tsx",
  geofenceReconciliation: "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx",
  bookingGap: "apps/frontend/src/pages/reports/BookingGapReport.tsx",
  geofenceDwell: "apps/frontend/src/pages/reports/GeofenceDwellReport.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const rawUtcDate = /new Date\(\)(?:\.toISOString\(\)\.(?:slice\(0, 10\)|split\("T"\)\[0\])|\.getUTC(?:FullYear|Month)\(\))/;

// VERIFY-STATIC-SELFTEST-STALE-97 (plannerLayout row): DispatchPlannersLayout.tsx used to compute its
// own default date directly via companyToday(). A later refactor (PlannerRangeProvider/PlannerRangeContext)
// moved that responsibility into planner-range.ts's buildPlannerRange(), consumed through
// PlannerRangeContext.tsx and the usePlannerRange() hook -- DispatchPlannersLayout.tsx no longer touches
// dates itself at all, it just renders <PlannerRangeProvider>. The blanket "every frontend file must call
// companyToday() literally" check therefore went red on a file that was never wrong -- the invariant (the
// planner's default range is company-local "today", not raw UTC) still holds, just one layer removed.
// These two keys get their own targeted checks (below) instead of the blanket loop.
const DELEGATES_TO_PLANNER_RANGE_CONTEXT = new Set(["plannerLayout"]);
const NO_BLANKET_COMPANY_TODAY_CHECK = new Set(["plannerService", "backendBusinessDate", "plannerRangeContext", ...DELEGATES_TO_PLANNER_RANGE_CONTEXT]);

function findings(s) {
  const failures = [];
  for (const key of Object.keys(files)) {
    if (!NO_BLANKET_COMPANY_TODAY_CHECK.has(key) && !/companyToday\(\)/.test(s[key])) failures.push(`${key} must use companyToday`);
    if (rawUtcDate.test(s[key])) failures.push(`${key} retains raw UTC business-date default`);
  }
  for (const key of DELEGATES_TO_PLANNER_RANGE_CONTEXT) {
    if (!/PlannerRangeProvider/.test(s[key])) failures.push(`${key} must delegate its date range to PlannerRangeProvider`);
  }
  if (!/usePlannerRangeState\(/.test(s.plannerRangeContext)) failures.push("plannerRangeContext must wire PlannerRangeProvider through usePlannerRangeState (planner-range.ts's companyToday()-based default)");
  if (!/companyBusinessDate\(\)/.test(s.plannerService) || !/companyBusinessDateStartIso\(/.test(s.plannerService)) failures.push("planner service must use company business dates and Central-midnight instants");
  if (/T00:00:00\.000Z/.test(s.plannerService)) failures.push("planner service must not treat business-date midnight as UTC midnight");
  if (!/export function companyBusinessDateStartIso/.test(s.backendBusinessDate)) failures.push("backend business-date helper must expose Central-midnight conversion");
  for (const key of ["driverHub", "dispatchOverview", "borderHistory", "dispatcherPerformance", "driverTeam", "geofenceReconciliation", "bookingGap"]) {
    if (!/addDaysIso\(/.test(s[key])) failures.push(`${key} range arithmetic must use addDaysIso`);
  }
  if (!/monthBoundsIso\(companyToday\(\)\)\.start/.test(s.geofenceDwell)) failures.push("geofence dwell month start must use company month bounds");
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const frontendKeys = Object.keys(files).filter((key) => !NO_BLANKET_COMPANY_TODAY_CHECK.has(key));
  const mutations = frontendKeys.map((key) => ({
    ...source,
    [key]: source[key].replace("companyToday()", 'new Date().toISOString().slice(0, 10)'),
  }));
  mutations.push(
    { ...source, plannerService: source.plannerService.replace("companyBusinessDate()", "new Date().toISOString().slice(0, 10)") },
    { ...source, plannerService: source.plannerService.replaceAll("companyBusinessDateStartIso", "utcMidnightIso") },
    { ...source, backendBusinessDate: source.backendBusinessDate.replace("export function companyBusinessDateStartIso", "function removedCompanyBusinessDateStartIso") },
    { ...source, plannerLayout: source.plannerLayout.replaceAll("PlannerRangeProvider", "RemovedRangeProvider") },
    { ...source, plannerRangeContext: source.plannerRangeContext.replace("usePlannerRangeState(", "useRemovedRangeState(") },
  );
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-nonmoney-frontend-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-nonmoney-frontend-business-date PASS");
