#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","connectivity"],"leafRe":"^safety\\.panel\\.driver_safety_profile$","task":"SAFETY-DRIVER-PROFILE-UUID-FRAGMENT-LABEL","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-safety-driver-profile-honest-identity";
const files = {
  page: fs.readFileSync("apps/frontend/src/pages/safety/driver-safety/DriverSafetyProfilePage.tsx", "utf8"),
  panel: fs.readFileSync("apps/frontend/src/components/safety/driver-safety/DriverSafetyProfilePanel.tsx", "utf8"),
};

function failures(candidate = files) {
  const found = [];
  if (!/getDriverSafetyAggregate\(driverId, companyId\)/.test(candidate.page)) found.push("Safety profile loses explicit company-scoped aggregate");
  if (!/driverCredentialLabel=\{driver\.cdl_number \? `CDL \$\{driver\.cdl_number\}` : "CDL not on file"\}/.test(candidate.page)) found.push("Safety profile lacks honest CDL identity/absence label");
  if (/driver\.id\.slice\(0,\s*8\)/.test(candidate.page)) found.push("Safety profile still exposes a driver UUID fragment");
  if (!/driverCredentialLabel: string/.test(candidate.panel) || !/\(\{driverCredentialLabel\}\)/.test(candidate.panel)) found.push("Safety panel does not consume the honest credential label");
  if (!/<EntityLink kind="driver" id=\{driverId\} label=\{driverName\}/.test(candidate.panel)) found.push("Safety panel loses canonical driver drill-through");
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["page", "getDriverSafetyAggregate(driverId, companyId)", "getDriverSafetyAggregate(driverId, '')"],
    ["page", 'driverCredentialLabel={driver.cdl_number ? `CDL ${driver.cdl_number}` : "CDL not on file"}', "driverCredentialLabel={driver.cdl_number ?? driver.id.slice(0, 8)}"],
    ["panel", "driverCredentialLabel: string", "driverDisplayId: string"],
    ["panel", '<EntityLink kind="driver" id={driverId} label={driverName} />', "<span>{driverName}</span>"],
  ];
  const escaped = [];
  for (const [key, needle, replacement] of mutations) {
    if (!files[key].includes(needle)) { escaped.push(`${key}: mutation anchor missing (${needle})`); continue; }
    const mutant = { ...files, [key]: files[key].replace(needle, replacement) };
    if (failures(mutant).length === 0) escaped.push(`${key}: planted defect escaped (${needle})`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — Safety driver profile uses human identity and honest CDL absence copy`);
