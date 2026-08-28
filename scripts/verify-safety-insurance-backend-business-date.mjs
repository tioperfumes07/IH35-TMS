#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/backend/src/insurance/coverage-gap.service.ts",
  "apps/backend/src/safety/eld-audit-trail/eld-audit-pdf-renderer.service.ts",
  "apps/backend/src/safety/driver-scoring/scoring.service.ts",
  "apps/backend/src/safety/expiry-tracking/cert-monitor.service.ts",
  "apps/backend/src/safety/drug-alcohol/random-pool.service.ts",
  "apps/backend/src/safety/driver-scheduler.service.ts",
];
const sources = files.map((file) => fs.readFileSync(file, "utf8"));
function findings(values) {
  const failures = [];
  values.forEach((source, index) => {
    if (!/companyBusinessDate\(/.test(source)) failures.push(`${files[index]} must use companyBusinessDate`);
    if (/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(source)) failures.push(`${files[index]} retains raw UTC today`);
  });
  if (/referenceDate\.getUTCFullYear/.test(values[2])) failures.push("scoring period retains UTC reference day");
  if (/referenceDate\.getUTCFullYear/.test(values[3])) failures.push("cert monitor retains UTC reference day");
  return failures;
}
const failures = findings(sources);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = sources.map((source, index) => sources.map((value, candidate) => candidate === index ? value.replace(/companyBusinessDate\([^)]*\)/, "new Date().toISOString().slice(0, 10)") : value));
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-safety-insurance-backend-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-safety-insurance-backend-business-date PASS");
