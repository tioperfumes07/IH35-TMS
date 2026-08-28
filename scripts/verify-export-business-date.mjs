#!/usr/bin/env node
import fs from "node:fs";

const files = {
  customers: "apps/frontend/src/pages/customers/CustomersListView.tsx",
  driverProfiles: "apps/frontend/src/pages/drivers/DriversListPage.tsx",
  driverDqf: "apps/frontend/src/pages/drivers/DriversTable.tsx",
  workOrders: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  severeRepair: "apps/backend/src/maintenance/severe-repair-pdf-export.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function findings(s) {
  const failures = [];
  for (const key of ["customers", "driverProfiles", "driverDqf", "workOrders"]) {
    if (!/companyToday\(\)/.test(s[key])) failures.push(`${key} export must use companyToday`);
    if (/download\s*=.*new Date\(\)\.toISOString\(\)/.test(s[key])) failures.push(`${key} export retains UTC filename`);
  }
  if ((s.severeRepair.match(/companyBusinessDate\(\)/g) ?? []).length < 2) {
    failures.push("severe-repair PDF body and filename must use companyBusinessDate");
  }
  if (/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(s.severeRepair)) {
    failures.push("severe-repair PDF retains UTC generated date");
  }
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = [
    { ...source, customers: source.customers.replace("companyToday()", 'new Date().toISOString().slice(0, 10)') },
    { ...source, driverProfiles: source.driverProfiles.replace("companyToday()", 'new Date().toISOString().slice(0, 10)') },
    { ...source, driverDqf: source.driverDqf.replace("companyToday()", 'new Date().toISOString().slice(0, 10)') },
    { ...source, workOrders: source.workOrders.replace("companyToday()", 'new Date().toISOString().slice(0, 10)') },
    { ...source, severeRepair: source.severeRepair.replaceAll("companyBusinessDate()", 'new Date().toISOString().slice(0, 10)') },
  ];
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-export-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-export-business-date PASS");
