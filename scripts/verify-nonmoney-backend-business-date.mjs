#!/usr/bin/env node
import fs from "node:fs";

const files = {
  pmDue: "apps/backend/src/maint/pm-due.shared.ts",
  leaveRollover: "apps/backend/src/cron/driver-leave-balance-rollover.cron.ts",
  bookingGap: "apps/backend/src/jobs/booking-gap-aggregator-worker.ts",
  driverMetrics: "apps/backend/src/integrity/driver-metrics.routes.ts",
  brakeWear: "apps/backend/src/integrations/samsara/cap-13-brake-wear/service.ts",
  tireTread: "apps/backend/src/integrations/samsara/cap-12-tire-tread/projection.service.ts",
  filings: "apps/backend/src/compliance/filings-aggregate.service.ts",
  drugAlcohol: "apps/backend/src/compliance/drug-alcohol.routes.ts",
  ocr: "apps/backend/src/ocr/ocr.service.ts",
  ocrIntake: "apps/backend/src/dispatch/ocr-intake.lib.ts",
  helper: "apps/backend/src/lib/company-business-date.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const rawUtcToday = /new Date\(\)(?:\.toISOString\(\)\.slice\(0, 10\)|\.getUTCFullYear\(\))/;

function findings(s) {
  const failures = [];
  for (const key of Object.keys(files).filter((key) => key !== "helper")) {
    if (!/companyBusinessDate\(\)/.test(s[key])) failures.push(`${key} must use companyBusinessDate`);
    if (rawUtcToday.test(s[key])) failures.push(`${key} retains raw UTC business-date default`);
  }
  for (const key of ["bookingGap", "brakeWear", "tireTread", "ocr", "ocrIntake"]) {
    if (!/addBusinessDateDays\(/.test(s[key])) failures.push(`${key} date range/projection must use addBusinessDateDays`);
  }
  for (const key of ["brakeWear", "tireTread"]) {
    if (!/businessDateDaysBetween\(/.test(s[key])) failures.push(`${key} remaining-days calculation must use businessDateDaysBetween`);
  }
  if (!/export function addBusinessDateDays/.test(s.helper)) failures.push("company date helper missing addBusinessDateDays");
  if (!/export function businessDateDaysBetween/.test(s.helper)) failures.push("company date helper missing businessDateDaysBetween");
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = Object.keys(files)
    .filter((key) => key !== "helper")
    .map((key) => ({ ...source, [key]: source[key].replace("companyBusinessDate()", 'new Date().toISOString().slice(0, 10)') }));
  mutations.push({ ...source, helper: source.helper.replace("export function addBusinessDateDays", "function addBusinessDateDays") });
  mutations.push({ ...source, helper: source.helper.replace("export function businessDateDaysBetween", "function businessDateDaysBetween") });
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-nonmoney-backend-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-nonmoney-backend-business-date PASS");
