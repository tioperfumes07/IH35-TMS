#!/usr/bin/env node
import fs from "node:fs";

const files = {
  dashboard: "apps/frontend/src/pages/safety/DrugAlcoholDashboard.tsx",
  routes: "apps/backend/src/safety/driver-scheduler.routes.ts",
  service: "apps/backend/src/safety/driver-scheduler.service.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function findings(s) {
  const failures = [];
  if ((s.dashboard.match(/companyToday\(\)/g) ?? []).length < 2) failures.push("drug/alcohol year and quarter must use companyToday");
  if (/getUTC(?:FullYear|Month)\(\)/.test(s.dashboard)) failures.push("drug/alcohol dashboard retains UTC calendar defaults");
  if (!/function companyBusinessYear\(\)/.test(s.routes)) failures.push("scheduler routes need canonical companyBusinessYear");
  if ((s.routes.match(/\?\? companyBusinessYear\(\)/g) ?? []).length !== 3) failures.push("all three scheduler route year defaults must use companyBusinessYear");
  if (/new Date\(\)\.getUTCFullYear\(\)/.test(s.routes)) failures.push("scheduler routes retain UTC year default");
  for (const path of ["/api/v1/driver/scheduler/request/:id/documentation", "/api/v1/driver/scheduler/balance"]) {
    const start = s.routes.indexOf(`\"${path}\"`);
    const routeHead = start >= 0 ? s.routes.slice(start, start + 180) : "";
    if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(routeHead)) failures.push(`${path} must be rate-limited`);
  }
  if (!/Number\(companyBusinessDate\(\)\.slice\(0, 4\)\)/.test(s.service)) failures.push("leave request numbering must use company business year");
  if (/new Date\(\)\.getUTCFullYear\(\)/.test(s.service)) failures.push("scheduler service retains UTC request-number year");
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = [
    { ...source, dashboard: source.dashboard.replace("Number(companyToday().slice(0, 4))", "new Date().getUTCFullYear()") },
    { ...source, dashboard: source.dashboard.replace("Number(companyToday().slice(5, 7))", "new Date().getUTCMonth() + 1") },
    { ...source, routes: source.routes.replace("?? companyBusinessYear()", "?? new Date().getUTCFullYear()") },
    { ...source, routes: source.routes.replace("?? companyBusinessYear()", "?? 2026") },
    { ...source, service: source.service.replace("Number(companyBusinessDate().slice(0, 4))", "new Date().getUTCFullYear()") },
    {
      ...source,
      routes: source.routes.replace(
        '"/api/v1/driver/scheduler/request/:id/documentation",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },',
        '"/api/v1/driver/scheduler/request/:id/documentation",'
      ),
    },
    {
      ...source,
      routes: source.routes.replace(
        '"/api/v1/driver/scheduler/balance",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },',
        '"/api/v1/driver/scheduler/balance",'
      ),
    },
  ];
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-safety-company-year SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-safety-company-year PASS");
