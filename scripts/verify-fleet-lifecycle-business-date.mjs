#!/usr/bin/env node
import fs from "node:fs";

const files = {
  unit: "apps/frontend/src/components/vehicle-profile/StatusChangeModal.tsx",
  trailer: "apps/frontend/src/components/trailer-profile/StatusChangeModal.tsx",
  reefer: "apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function findings(s) {
  const failures = [];
  if (!/function todayIso\(\)\s*\{\s*return companyToday\(\);\s*\}/.test(s.unit)) failures.push("unit lifecycle today must use companyToday");
  if (!/function todayIso\(\)\s*\{\s*return companyToday\(\);\s*\}/.test(s.trailer)) failures.push("trailer lifecycle today must use companyToday");
  if (!/lastServiceDate:\s*companyToday\(\)/.test(s.reefer)) failures.push("reefer service date must use companyToday");
  for (const [key, value] of Object.entries(s)) {
    if (/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(value)) failures.push(`${key} retains raw UTC business date`);
  }
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const utc = "new Date().toISOString().slice(0, 10)";
  const mutations = [
    { ...source, unit: source.unit.replace("return companyToday();", `return ${utc};`) },
    { ...source, trailer: source.trailer.replace("return companyToday();", `return ${utc};`) },
    { ...source, reefer: source.reefer.replace("lastServiceDate: companyToday()", `lastServiceDate: ${utc}`) },
  ];
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-fleet-lifecycle-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-fleet-lifecycle-business-date PASS");
