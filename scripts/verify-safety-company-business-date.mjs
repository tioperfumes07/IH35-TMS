#!/usr/bin/env node
import fs from "node:fs";

const files = {
  badge: "apps/frontend/src/components/safety/CertExpiryBadge.tsx",
  cards: "apps/frontend/src/components/safety/DriverSafetyCards.tsx",
  meetings: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
  training: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function findings(s) {
  const failures = [];
  for (const key of ["badge", "cards"]) {
    if (!/companyToday\(\)\.split\("-"\)\.map\(Number\)/.test(s[key])) failures.push(`${key} expiry countdown must use companyToday`);
    if (/now\.getUTCFullYear/.test(s[key])) failures.push(`${key} retains UTC-today countdown`);
  }
  for (const key of ["meetings", "training"]) {
    if (!/max=\{companyToday\(\)\}/.test(s[key])) failures.push(`${key} completion max must use companyToday`);
  }
  return failures;
}
const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = [
    { ...source, badge: source.badge.replace('companyToday().split("-").map(Number)', '[new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate()]') },
    { ...source, cards: source.cards.replace('companyToday().split("-").map(Number)', '[new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, new Date().getUTCDate()]') },
    { ...source, meetings: source.meetings.replace("max={companyToday()}", 'max={new Date().toISOString().slice(0, 10)}') },
    { ...source, training: source.training.replace("max={companyToday()}", 'max={new Date().toISOString().slice(0, 10)}') },
  ];
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-safety-company-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-safety-company-business-date PASS");
