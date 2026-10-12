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

// LEAD 443.99 class B (2026-10-12) — where the profile's tab strip lives.
//   old rule: DriverProfilePage renders <NavyPageSubNav> and it precedes driver-profile-kpi-strip.
//   new rule: DriverProfilePage renders <DriverOverviewBoard ... hideChrome> before driver-profile-kpi-strip, and
//             DriverOverviewBoard renders <ProfileTabStrip> in its hideChrome branch (the tab strip).
//   why: DRV-F420 (#25517, 2026f27d5a) replaced the profile's NavyPageSubNav with DriverOverviewBoard's
//        ProfileTabStrip (the approved DriverDetail tabs). Tabs-first (C-11/D11) is unchanged and still enforced.
const BOARD_FILE = "apps/frontend/src/components/boards/DriverOverviewBoard.tsx";
export function tabsFirstFailures(profile, board) {
  const f = [];
  const stripIdx = profile.search(/<DriverOverviewBoard\b[^>]*\bhideChrome\b/);
  const kpiIdx = profile.indexOf("driver-profile-kpi-strip");
  if (!/props\.hideChrome \? \(?\s*<ProfileTabStrip\b/.test(board)) f.push(`${BOARD_FILE}: hideChrome board must render the ProfileTabStrip`);
  if (stripIdx < 0 || kpiIdx < 0 || stripIdx > kpiIdx) f.push("DriverProfilePage: C-11 KPIs must render below the tab strip (DriverOverviewBoard hideChrome) — tabs first");
  return f;
}

function audit() {
  const f = [];
  const profile = read(FILES.profile);
  const tabs = read(FILES.tabs);
  if (!/DRIVER_PROFILE_TABS/.test(tabs)) f.push(`${FILES.tabs}: C-20 DRIVER_PROFILE_TABS missing`);
  if (!/Settlements/.test(tabs) || !/Cash advances/.test(tabs) || !/Additional payments/.test(tabs)) {
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
  for (const x of tabsFirstFailures(profile, read(BOARD_FILE))) f.push(`${FILES.profile}: ${x}`);
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
  // 443.99 — planted tabs-first violations must be caught (the old selftest only re-ran the audit).
  const profileSrc = read(FILES.profile);
  const boardSrc = read(BOARD_FILE);
  const kpiFirst = profileSrc.replace(/<DriverOverviewBoard\b[^>]*\bhideChrome\b/, "<DriverOverviewBoard").replace('data-testid="driver-profile-kpi-strip"', 'data-testid="driver-profile-kpi-strip" /* <DriverOverviewBoard hideChrome */');
  const plants = [
    ["KPI band above the tab strip", tabsFirstFailures(profileSrc.replace(/<DriverOverviewBoard\b[^>]*\bhideChrome\b[^>]*\/>/, ""), boardSrc)],
    ["board renders no tab strip", tabsFirstFailures(profileSrc, boardSrc.replaceAll("<ProfileTabStrip", "<NoStrip"))],
    ["strip mounted after the KPI band", tabsFirstFailures(kpiFirst, boardSrc)],
  ];
  const escaped = plants.filter(([, f]) => f.length === 0).map(([n]) => n);
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted violation escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${plants.length}/${plants.length} planted tabs-first violations caught`);
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
