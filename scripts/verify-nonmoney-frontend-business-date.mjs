#!/usr/bin/env node
import fs from "node:fs";

const files = {
  driverHub: "apps/frontend/src/pages/home/DriverHubReportingPage.tsx",
  userDetail: "apps/frontend/src/pages/UserDetail.tsx",
  upload: "apps/frontend/src/components/documents/UploadModal.tsx",
  plannerRange: "apps/frontend/src/pages/dispatch/planners/planner-range.ts",
  plannerLayout: "apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx",
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
    if (!/companyToday\(\)/.test(s[key])) failures.push(`${key} must use companyToday`);
    if (rawUtcDate.test(s[key])) failures.push(`${key} retains raw UTC business-date default`);
  }
  for (const key of ["driverHub", "dispatchOverview", "borderHistory", "dispatcherPerformance", "driverTeam", "geofenceReconciliation", "bookingGap"]) {
    if (!/addDaysIso\(/.test(s[key])) failures.push(`${key} range arithmetic must use addDaysIso`);
  }
  if (!/monthBoundsIso\(companyToday\(\)\)\.start/.test(s.geofenceDwell)) failures.push("geofence dwell month start must use company month bounds");
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = Object.keys(files).map((key) => ({
    ...source,
    [key]: source[key].replace("companyToday()", 'new Date().toISOString().slice(0, 10)'),
  }));
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
