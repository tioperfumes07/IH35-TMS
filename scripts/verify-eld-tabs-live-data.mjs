#!/usr/bin/env node
/**
 * ELD-LIVE-DATA — EldPage (and tab children) must wire real useQuery/fetch for
 * live-duty, violations, and unidentified. Certifications/settings may stay
 * honest-empty. Never ship hardcoded production fixture arrays.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const paths = {
  eldPage: path.join(ROOT, "apps/frontend/src/pages/eld/EldPage.tsx"),
  eldApi: path.join(ROOT, "apps/frontend/src/api/eld.ts"),
  liveDuty: path.join(ROOT, "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx"),
  violations: path.join(ROOT, "apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx"),
  unidentified: path.join(ROOT, "apps/frontend/src/pages/eld/tabs/UnidentifiedTab.tsx"),
  honestEmpty: path.join(ROOT, "apps/frontend/src/pages/eld/tabs/HonestEmptyTab.tsx"),
  tabsConfig: path.join(ROOT, "apps/frontend/src/pages/eld/ELD_TABS_CONFIG.ts"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-eld-tabs-live-data] ${msg}`);
  process.exit(1);
}

function mustInclude(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) fail(`${label} missing required marker: ${needle}`);
  }
}

function mustNotMatch(label, source, patterns) {
  for (const re of patterns) {
    if (re.test(source)) fail(`${label} must not contain forbidden pattern: ${re}`);
  }
}

function main() {
  const eldPage = read(paths.eldPage);
  const eldApi = read(paths.eldApi);
  const liveDuty = read(paths.liveDuty);
  const violations = read(paths.violations);
  const unidentified = read(paths.unidentified);
  const honestEmpty = read(paths.honestEmpty);
  const tabsConfig = read(paths.tabsConfig);

  for (const [label, src] of Object.entries({
    EldPage: eldPage,
    "api/eld.ts": eldApi,
    LiveDutyTab: liveDuty,
    ViolationsTab: violations,
    UnidentifiedTab: unidentified,
    HonestEmptyTab: honestEmpty,
    ELD_TABS_CONFIG: tabsConfig,
  })) {
    if (src == null) fail(`missing file for ${label}`);
  }

  mustInclude("EldPage", eldPage, [
    "LiveDutyTab",
    "ViolationsTab",
    "UnidentifiedTab",
    "HonestEmptyTab",
    'activeTab === "live-duty"',
    'activeTab === "violations"',
    'activeTab === "unidentified"',
    'activeTab === "certifications"',
    'activeTab === "settings"',
  ]);

  mustInclude("api/eld.ts", eldApi, [
    "fetchEldLiveDutyRoster",
    "fetchEldHosViolations",
    "fetchEldUnidentifiedDriving",
    "getHosDailyRoster",
    "listHosViolations",
    "getFleetLocationHos",
  ]);

  mustInclude("LiveDutyTab", liveDuty, ["useQuery", "fetchEldLiveDutyRoster"]);
  mustInclude("ViolationsTab", violations, ["useQuery", "fetchEldHosViolations"]);
  mustInclude("UnidentifiedTab", unidentified, ["useQuery", "fetchEldUnidentifiedDriving"]);
  mustInclude("HonestEmptyTab", honestEmpty, ["data-eld-honest-empty"]);

  mustInclude("ELD_TABS_CONFIG", tabsConfig, [
    'id: "live-duty"',
    'id: "violations"',
    'id: "unidentified"',
    'id: "certifications"',
    'id: "settings"',
    "not wired yet",
  ]);

  // Forbidden: hardcoded fake fixture driver arrays gated incorrectly for production.
  const fakePatterns = [
    /FAKE_ELD_/i,
    /fixtureDrivers\s*=\s*\[/,
    /MOCK_DUTY_ROWS/,
    /demoDrivers\s*=\s*\[\s*\{/,
    /NODE_ENV\s*!==\s*['"]production['"][\s\S]{0,200}drivers:\s*\[/,
  ];
  for (const [label, src] of [
    ["EldPage", eldPage],
    ["LiveDutyTab", liveDuty],
    ["ViolationsTab", violations],
    ["UnidentifiedTab", unidentified],
    ["api/eld.ts", eldApi],
  ]) {
    mustNotMatch(label, src, fakePatterns);
  }

  // Stub-only EldPage regression: must not be the old empty-state-only shell.
  if (
    eldPage.includes("activeConfig.emptyTitle") &&
    !eldPage.includes("LiveDutyTab")
  ) {
    fail("EldPage still renders only static empty states (missing LiveDutyTab wiring)");
  }

  console.log("[verify-eld-tabs-live-data] OK");
}

main();
