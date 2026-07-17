#!/usr/bin/env node
/**
 * Block 0441-mod5: Drivers page Teams view must be reachable via wired tab control.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  driversPage: path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx"),
  tabsTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/DriversPage.tabs.test.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-teams-tab-reachable] ${msg}`);
  process.exit(1);
}

function main() {
  const driversPage = read(paths.driversPage);
  const tabsTest = read(paths.tabsTest);
  const failures = [];

  if (/const \[activeTab\]\s*=\s*useState/.test(driversPage)) {
    failures.push("DriversPage must destructure setActiveTab — const [activeTab] without setter is dead");
  }
  if (!/const \[activeTab,\s*setActiveTab\]\s*=\s*useState<"drivers"\s*\|\s*"teams">/.test(driversPage)) {
    failures.push("DriversPage must declare [activeTab, setActiveTab] for drivers|teams view toggle");
  }
  if (!driversPage.includes('setActiveTab(id)')) {
    failures.push("DriversPage must wire setActiveTab in the Drivers/Teams tab onChange handler");
  }
  if (!driversPage.includes('{ id: "teams", label: "Teams" }')) {
    failures.push("DriversPage must render a visible Teams tab control");
  }
  if (!driversPage.includes('activeTab === "teams"')) {
    failures.push("DriversPage must gate Teams content on activeTab === \"teams\"");
  }
  if (!driversPage.includes("+ Create Team")) {
    failures.push("DriversPage Teams view must expose + Create Team");
  }
  if (!tabsTest.includes("Teams")) {
    failures.push("DriversPage.tabs.test must cover switching to the Teams view");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-teams-tab-reachable] OK");
}

main();
