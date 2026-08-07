#!/usr/bin/env node
/**
 * ELD-T01..T04 / ELD-LIVE-DATA — EldPage tab children must wire real useQuery/fetch for
 * live-duty, violations, and unidentified. Certifications/settings stay honest-empty.
 * Never ship hardcoded production fixture arrays.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-eld-tabs-live-data";

const paths = {
  eldPage: "apps/frontend/src/pages/eld/EldPage.tsx",
  eldApi: "apps/frontend/src/api/eld.ts",
  liveDuty: "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx",
  violations: "apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx",
  unidentified: "apps/frontend/src/pages/eld/tabs/UnidentifiedTab.tsx",
  honestEmpty: "apps/frontend/src/pages/eld/tabs/HonestEmptyTab.tsx",
  tabsConfig: "apps/frontend/src/pages/eld/ELD_TABS_CONFIG.ts",
};

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function collectProblems(sources = Object.fromEntries(Object.entries(paths).map(([k, rel]) => [k, read(rel)]))) {
  const problems = [];
  for (const [key, rel] of Object.entries(paths)) {
    if (sources[key] == null) problems.push(`missing file: ${rel}`);
  }
  if (problems.length) return problems;

  const {
    eldPage,
    eldApi,
    liveDuty,
    violations,
    unidentified,
    honestEmpty,
    tabsConfig,
  } = sources;

  const need = (label, src, needles) => {
    for (const needle of needles) {
      if (!src.includes(needle)) problems.push(`${label} missing: ${needle}`);
    }
  };

  need("EldPage", eldPage, [
    "LiveDutyTab",
    "ViolationsTab",
    "UnidentifiedTab",
    "HonestEmptyTab",
    'activeTab === "live-duty"',
    'activeTab === "violations"',
    'activeTab === "unidentified"',
    'activeTab === "certifications"',
    'activeTab === "settings"',
    'data-testid="eld-page"',
    'testId="eld-certifications-honest-empty"',
    'testId="eld-settings-honest-empty"',
  ]);

  need("api/eld.ts", eldApi, [
    "fetchEldLiveDutyRoster",
    "fetchEldHosViolations",
    "fetchEldUnidentifiedDriving",
    "getHosDailyRoster",
    "listHosViolations",
    "getFleetLocationHos",
  ]);

  need("LiveDutyTab", liveDuty, ["useQuery", "fetchEldLiveDutyRoster", 'data-testid="eld-live-duty-tab"']);
  need("ViolationsTab", violations, ["useQuery", "fetchEldHosViolations", 'data-testid="eld-violations-tab"']);
  need("UnidentifiedTab", unidentified, [
    "useQuery",
    "fetchEldUnidentifiedDriving",
    'data-testid="eld-unidentified-tab"',
  ]);
  need("HonestEmptyTab", honestEmpty, ["data-eld-honest-empty"]);

  need("ELD_TABS_CONFIG", tabsConfig, [
    'id: "live-duty"',
    'id: "violations"',
    'id: "unidentified"',
    'id: "certifications"',
    'id: "settings"',
    "not wired yet",
  ]);

  const fakePatterns = [
    /FAKE_ELD_/i,
    /fixtureDrivers\s*=\s*\[/,
    /MOCK_DUTY_ROWS/,
    /demoDrivers\s*=\s*\[\s*\{/,
  ];
  for (const [label, src] of [
    ["EldPage", eldPage],
    ["LiveDutyTab", liveDuty],
    ["ViolationsTab", violations],
    ["UnidentifiedTab", unidentified],
    ["api/eld.ts", eldApi],
  ]) {
    for (const re of fakePatterns) {
      if (re.test(src)) problems.push(`${label} forbidden fixture pattern: ${re}`);
    }
  }

  if (eldPage.includes("activeConfig.emptyTitle") && !eldPage.includes("LiveDutyTab")) {
    problems.push("EldPage still renders only static empty states (missing LiveDutyTab wiring)");
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = Object.fromEntries(Object.entries(paths).map(([k, rel]) => [k, read(rel)]));
  const broken = {
    ...real,
    violations: "export function ViolationsTab() { return <div>stub</div>; }\n",
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken ViolationsTab not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ELD tabs wire live APIs; cert/settings honest-empty (ELD-T01..T04)`);
}
