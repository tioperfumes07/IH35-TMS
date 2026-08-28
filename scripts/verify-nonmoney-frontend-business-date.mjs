#!/usr/bin/env node
import fs from "node:fs";

const files = {
  driverHub: "apps/frontend/src/pages/home/DriverHubReportingPage.tsx",
  userDetail: "apps/frontend/src/pages/UserDetail.tsx",
  upload: "apps/frontend/src/components/documents/UploadModal.tsx",
  plannerRange: "apps/frontend/src/pages/dispatch/planners/planner-range.ts",
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

function findings(s) {
  const failures = [];
  for (const key of Object.keys(files)) {
    if (key !== "plannerService" && key !== "backendBusinessDate" && !/companyToday\(\)/.test(s[key])) failures.push(`${key} must use companyToday`);
    if (rawUtcDate.test(s[key])) failures.push(`${key} retains raw UTC business-date default`);
  }
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
  const frontendKeys = Object.keys(files).filter((key) => key !== "plannerService" && key !== "backendBusinessDate");
  const mutations = frontendKeys.map((key) => ({
    ...source,
    [key]: source[key].replace("companyToday()", 'new Date().toISOString().slice(0, 10)'),
  }));
  mutations.push(
    { ...source, plannerService: source.plannerService.replace("companyBusinessDate()", "new Date().toISOString().slice(0, 10)") },
    { ...source, plannerService: source.plannerService.replaceAll("companyBusinessDateStartIso", "utcMidnightIso") },
    { ...source, backendBusinessDate: source.backendBusinessDate.replace("export function companyBusinessDateStartIso", "function removedCompanyBusinessDateStartIso") },
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
