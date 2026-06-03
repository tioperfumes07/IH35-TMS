#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_ACCIDENTS_ROOT ?? process.cwd();

const paths = {
  accidentsPage: path.join(ROOT, "apps/frontend/src/pages/safety/AccidentsPage.tsx"),
  sharedDrawer: path.join(ROOT, "apps/frontend/src/components/safety/AccidentReportDrawer.tsx"),
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  safetyHome: path.join(ROOT, "apps/frontend/src/pages/safety/SafetyHome.tsx"),
  tabWrapper: path.join(ROOT, "apps/frontend/src/pages/safety/tabs/AccidentsIncidentsTab.tsx"),
};

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function main() {
  const failures = [];
  const accidentsPage = read(paths.accidentsPage);
  const sharedDrawer = read(paths.sharedDrawer);
  const tabsConfig = read(paths.tabsConfig);
  const safetyHome = read(paths.safetyHome);
  const tabWrapper = read(paths.tabWrapper);

  if (!accidentsPage.includes("export function AccidentsPage")) {
    failures.push("AccidentsPage.tsx missing canonical export");
  }
  if (!accidentsPage.includes('data-testid="accidents-page"')) {
    failures.push("AccidentsPage.tsx missing accidents-page test id");
  }
  if (!accidentsPage.includes("../../components/safety/AccidentReportDrawer")) {
    failures.push("AccidentsPage.tsx must import shared AccidentReportDrawer");
  }
  if (!sharedDrawer.includes("export function AccidentReportDrawer")) {
    failures.push("shared AccidentReportDrawer.tsx missing export");
  }
  if (!tabsConfig.includes('id: "accidents"') || !tabsConfig.includes('status: "Live"')) {
    failures.push("SAFETY_TABS_CONFIG accidents tab must be Live");
  }
  if (!/^\/\*\*[\s\S]*@deprecated/m.test(safetyHome.trimStart())) {
    failures.push("SafetyHome.tsx must carry @deprecated header");
  }
  if (!tabWrapper.includes("AccidentsPage")) {
    failures.push("AccidentsIncidentsTab must render AccidentsPage");
  }

  if (failures.length > 0) {
    console.error("verify:safety-accidents-wire-up FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-accidents-wire-up OK");
}

main();
