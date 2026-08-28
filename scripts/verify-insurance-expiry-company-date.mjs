#!/usr/bin/env node
import fs from "node:fs";

const paths = [
  "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
];
const sources = paths.map((file) => fs.readFileSync(file, "utf8"));
function findings(values) {
  const failures = [];
  values.forEach((source, index) => {
    if (!/companyToday\(\)/.test(source)) failures.push(`${paths[index]} does not use companyToday`);
    if (/Date\.UTC\(now\.getUTCFullYear\(\), now\.getUTCMonth\(\), now\.getUTCDate\(\)\)/.test(source)) failures.push(`${paths[index]} retains UTC-day expiry basis`);
  });
  return failures;
}
const failures = findings(sources);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = sources.map((source, index) => sources.map((value, candidate) => candidate === index ? value.replace("companyToday()", 'new Date().toISOString().slice(0, 10)') : value));
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-insurance-expiry-company-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-insurance-expiry-company-date PASS");
