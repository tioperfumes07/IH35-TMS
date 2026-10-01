#!/usr/bin/env node
/**
 * C-20 Driver Profile module shell (Cursor lane — lives under scripts/ops/ SHARED,
 * not scripts/verify-*.mjs which is CC-1-owned).
 * Asserts: NavyPageSubNav before KPI strip, A-13 accounting tabs, A-14 reports,
 * Proper Case names, (area) phone mask.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-c20-driver-profile-module";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  tabs: "apps/frontend/src/pages/drivers/driverProfileTabs.ts",
  phone: "apps/frontend/src/lib/formatPhoneAsTyped.ts",
  displayName: "apps/frontend/src/lib/driverDqf.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const profile = read(FILES.profile);
  const tabs = read(FILES.tabs);
  if (!/NavyPageSubNav/.test(profile)) f.push(`${FILES.profile}: C-20 NavyPageSubNav missing`);
  if (!/DRIVER_PROFILE_TABS/.test(tabs)) f.push(`${FILES.tabs}: C-20 DRIVER_PROFILE_TABS missing`);
  if (!/Settlements/.test(tabs) || !/Cash Advances/.test(tabs) || !/Deductions/.test(tabs)) {
    f.push(`${FILES.tabs}: C-20 accounting tabs missing`);
  }
  // ROUND 319 ORDERS — Fuel is a first-class profile tab (E-21/E-22 verdicts), not under Legal.
  if (!/"Fuel"/.test(tabs) || !/Fuel: "fuel"/.test(tabs)) {
    f.push(`${FILES.tabs}: ROUND 319 Fuel tab missing from DRIVER_PROFILE_TABS`);
  }
  if (!/activeTab === "Fuel"/.test(profile) || !/dp-tab-fuel/.test(profile)) {
    f.push(`${FILES.profile}: ROUND 319 Fuel tab panel missing`);
  }
  if (!/Statement/.test(tabs) || !/Transactions/.test(tabs)) {
    f.push(`${FILES.tabs}: C-20 report set missing`);
  }
  const navIdx = profile.indexOf("NavyPageSubNav");
  const kpiIdx = profile.indexOf("driver-profile-kpi-strip");
  if (navIdx < 0 || kpiIdx < 0 || navIdx > kpiIdx) {
    f.push(`${FILES.profile}: C-11 KPIs must render below NavyPageSubNav (tabs first)`);
  }
  const phone = read(FILES.phone);
  if (!/\(\$\{area\}\)/.test(phone)) {
    f.push(`${FILES.phone}: C-12 phone must format as (area) prefix-line`);
  }
  const displayName = read(FILES.displayName);
  if (!/properDriverNamePart|charAt\(0\)\.toUpperCase\(\) \+ .*slice\(1\)\.toLowerCase\(\)/.test(displayName)) {
    f.push(`${FILES.displayName}: C-12 driverDisplayName must force Proper Case (never ALL CAPS)`);
  }
  return f;
}

if (SELFTEST) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — C-20 Driver Profile shell wired`);
process.exit(0);
