#!/usr/bin/env node
/**
 * 0441-mod1 — HOME SectionQuickJump counts must derive from canonical nav registries,
 * not stale literals (38 / 22 / 19 / 27 drift).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const paths = {
  homeQuickJumps: path.join(ROOT, "apps/frontend/src/pages/home/homeQuickJumps.ts"),
  defaultHome: path.join(ROOT, "apps/frontend/src/pages/home/roles/DefaultHome.tsx"),
  ownerHome: path.join(ROOT, "apps/frontend/src/pages/home/OwnerHome.tsx"),
  accountingManifest: path.join(ROOT, "apps/frontend/src/pages/accounting/subnav-manifest.ts"),
  bankingNav: path.join(ROOT, "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts"),
  fuelTabs: path.join(ROOT, "apps/frontend/src/pages/fuel/FUEL_TABS_CONFIG.ts"),
  dispatchSubnav: path.join(ROOT, "apps/frontend/src/components/dispatch/DispatchSubnav.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const failures = [];
  const homeQuickJumps = read(paths.homeQuickJumps);
  const defaultHome = read(paths.defaultHome);
  const ownerHome = read(paths.ownerHome);
  const accountingManifest = read(paths.accountingManifest);
  const bankingNav = read(paths.bankingNav);
  const fuelTabsConfig = read(paths.fuelTabs);
  const dispatchSubnav = read(paths.dispatchSubnav);

  for (const [label, src] of [
    ["DefaultHome", defaultHome],
    ["OwnerHome", ownerHome],
  ]) {
    if (!src.includes("HOME_QUICK_JUMPS")) {
      failures.push(`${label} must import HOME_QUICK_JUMPS from homeQuickJumps.ts`);
    }
    for (const stale of ["count: 38", "count: 22", "count: 19", "count: 27"]) {
      if (src.includes(stale)) {
        failures.push(`${label} must not hardcode stale quick-jump ${stale}`);
      }
    }
  }

  const requiredImports = [
    "ACCOUNTING_HOME_QUICK_JUMP_COUNT",
    "BANKING_HOME_QUICK_JUMP_COUNT",
    "FUEL_HOME_QUICK_JUMP_COUNT",
    "DISPATCH_HOME_QUICK_JUMP_COUNT",
    "MAINTENANCE_HOME_QUICK_JUMP_COUNT",
    "SAFETY_CANONICAL_TAB_COUNT",
    "DRIVERS_CANONICAL_SUBNAV_COUNT",
  ];
  for (const token of requiredImports) {
    if (!homeQuickJumps.includes(token)) {
      failures.push(`homeQuickJumps.ts must reference ${token}`);
    }
  }

  if (!accountingManifest.includes("ACCOUNTING_HOME_QUICK_JUMP_COUNT = SUBNAV_ITEMS.length")) {
    failures.push("subnav-manifest must alias ACCOUNTING_HOME_QUICK_JUMP_COUNT to SUBNAV_ITEMS.length");
  }
  if (!bankingNav.includes("BANKING_HOME_QUICK_JUMP_COUNT = BANKING_MODULE_TABS.length")) {
    failures.push("BANKING_NAV_CONFIG must alias BANKING_HOME_QUICK_JUMP_COUNT to BANKING_MODULE_TABS.length");
  }
  if (!fuelTabsConfig.includes("FUEL_HOME_QUICK_JUMP_COUNT = FUEL_SUBNAV.length")) {
    failures.push("FUEL_TABS_CONFIG must alias FUEL_HOME_QUICK_JUMP_COUNT to FUEL_SUBNAV.length");
  }
  if (!dispatchSubnav.includes("DISPATCH_HOME_QUICK_JUMP_COUNT = countDispatchNavDestinations(DISPATCH_NAV_ITEMS)")) {
    failures.push("DispatchSubnav must export DISPATCH_HOME_QUICK_JUMP_COUNT from DISPATCH_NAV_ITEMS");
  }
  if (!bankingNav.includes('from "./BANKING_NAV_CONFIG"') && !read(path.join(ROOT, "apps/frontend/src/pages/banking/BankingHome.tsx")).includes("BANKING_NAV_CONFIG")) {
    failures.push("BankingHome must import BANKING_MODULE_TABS from BANKING_NAV_CONFIG");
  }

  if (failures.length) {
    console.error("[verify-home-quickjump-counts] FAILED");
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }

  console.log("[verify-home-quickjump-counts] OK");
}

main();
