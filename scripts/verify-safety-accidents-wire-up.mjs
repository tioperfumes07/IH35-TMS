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

export function collectFailures({ accidentsPage, sharedDrawer, tabsConfig, safetyHome, tabWrapper }) {
  const failures = [];
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

  return failures;
}

function main() {
  const sources = {
    accidentsPage: read(paths.accidentsPage),
    sharedDrawer: read(paths.sharedDrawer),
    tabsConfig: read(paths.tabsConfig),
    safetyHome: read(paths.safetyHome),
    tabWrapper: read(paths.tabWrapper),
  };
  if (process.argv.includes("--selftest")) {
    const good = {
      accidentsPage: 'export function AccidentsPage() {} data-testid="accidents-page" ../../components/safety/AccidentReportDrawer',
      sharedDrawer: "export function AccidentReportDrawer() {}",
      tabsConfig: 'id: "accidents", status: "Live"',
      safetyHome: "/** @deprecated */ export function SafetyHome() {}",
      tabWrapper: "<AccidentsPage />",
    };
    if (collectFailures(good).length) throw new Error(`good fixture rejected: ${collectFailures(good).join("; ")}`);
    const mutations = [
      ["accidentsPage", "export function AccidentsPage", "function LegacyAccidentsPage", "missing canonical export"],
      ["accidentsPage", 'data-testid="accidents-page"', 'data-testid="removed"', "missing accidents-page test id"],
      ["accidentsPage", "../../components/safety/AccidentReportDrawer", "./LegacyDrawer", "must import shared"],
      ["sharedDrawer", "export function AccidentReportDrawer", "function LegacyDrawer", "missing export"],
      ["tabsConfig", 'status: "Live"', 'status: "Hidden"', "accidents tab must be Live"],
      ["safetyHome", "/** @deprecated */", "/** legacy */", "must carry @deprecated"],
      ["tabWrapper", "AccidentsPage", "LegacyAccidents", "must render AccidentsPage"],
    ];
    for (const [field, from, to, expected] of mutations) {
      const failures = collectFailures({ ...good, [field]: good[field].replace(from, to) });
      if (!failures.some((failure) => failure.includes(expected))) {
        throw new Error(`mutation escaped: ${expected} (${JSON.stringify(failures)})`);
      }
    }
    console.log(`verify:safety-accidents-wire-up SELFTEST OK ${mutations.length}/${mutations.length}`);
    return;
  }
  const failures = collectFailures(sources);
  if (failures.length > 0) {
    console.error("verify:safety-accidents-wire-up FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-accidents-wire-up OK");
}

main();
