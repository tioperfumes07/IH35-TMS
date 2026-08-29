#!/usr/bin/env node
/**
 * verify-safety-driver-cards — SM3 static guard.
 *
 * Locks in the two defects SM3 fixed so neither can silently regress:
 *   1. The Safety landing (driver-files tab) renders the per-driver DriverSafetyCards board.
 *   2. The previously-orphaned SafetyDashboardFilter counter bar is FED by a live tab: DriverFilesTab
 *      consumes useSafetyUiContext and reports counts via setDriverCounts, and the counter line renders
 *      ONLY when counts were reported (countsReported) — so tabs that do not feed it never lie with a
 *      permanent "0 active · 0 resolved · 0 total".
 *
 * Negative test: run against the pre-SM3 tree (DriverFilesTab that only rendered DriversListPage, and
 * SafetyDashboardFilter that rendered the counter unconditionally) and every assertion below fails.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const fail = (m) => {
  console.error(`FAIL verify-safety-driver-cards: ${m}`);
  process.exit(1);
};

function read(rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) fail(`missing file: ${rel}`);
  return readFileSync(full, "utf8");
}

const CARDS = "apps/frontend/src/components/safety/DriverSafetyCards.tsx";
const TAB = "apps/frontend/src/pages/safety/tabs/DriverFilesTab.tsx";
const FILTER = "apps/frontend/src/components/safety/SafetyDashboardFilter.tsx";
const LAYOUT = "apps/frontend/src/pages/safety/SafetyLayout.tsx";

function rosterFailures(source) {
  const problems = [];
  if (!/listAllDrivers\(\{[\s\S]*?operating_company_id:\s*companyId[\s\S]*?status:\s*"Active"[\s\S]*?search:\s*rosterSearch \|\| undefined[\s\S]*?\}\)/.test(source)) {
    problems.push(`${CARDS} must load the complete active company roster while preserving server search`);
  }
  if (/listDrivers\(\{[\s\S]{0,300}?limit:\s*(?:50|200)/.test(source)) {
    problems.push(`${CARDS} must not calculate company-wide safety cards from a capped driver page`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = read(CARDS);
  const mutations = [
    good.replace("listAllDrivers({", "listDrivers({\n        limit: 200,"),
    good.replace('status: "Active",', 'status: "Inactive",'),
    good.replace("operating_company_id: companyId,", "operating_company_id: undefined,"),
    good.replace("search: rosterSearch || undefined,", "search: undefined,"),
  ];
  if (rosterFailures(good).length) fail(`selftest baseline rejected: ${rosterFailures(good).join("; ")}`);
  mutations.forEach((mutated, index) => {
    if (mutated === good) fail(`selftest mutation ${index + 1} did not alter the source`);
    if (!rosterFailures(mutated).length) fail(`selftest mutation ${index + 1} escaped`);
  });
  console.log(`OK verify-safety-driver-cards SELFTEST: ${mutations.length}/${mutations.length} roster regressions rejected`);
  process.exit(0);
}

// 1. The cards component exists and sources the six required fields from REAL endpoints.
const cards = read(CARDS);
for (const needle of ["listDrivers", "getSafetyEventsFiltered", "listDaEnrollments", "onCountsChange", "onOpenProfile"]) {
  if (!cards.includes(needle)) fail(`${CARDS} must reference ${needle} (six-field sourcing / wiring)`);
}
for (const problem of rosterFailures(cards)) fail(problem);

// 2. The driver-files landing mounts the cards AND feeds the shared counter bar.
const tab = read(TAB);
if (!tab.includes("DriverSafetyCards")) fail(`${TAB} must mount DriverSafetyCards on the Safety landing`);
if (!tab.includes("useSafetyUiContext")) fail(`${TAB} must consume useSafetyUiContext (feed the shared filter bar)`);
if (!tab.includes("setDriverCounts")) fail(`${TAB} must report counts via setDriverCounts (fixes the orphaned counter bar)`);
if (!tab.includes("clearDriverCounts")) fail(`${TAB} must clear counts on unmount so other tabs do not show stale counts`);

// 3. The counter line renders ONLY when counts were reported (no lying 0·0·0 on tabs that do not feed it).
const filter = read(FILTER);
if (!filter.includes("countsReported")) fail(`${FILTER} must accept a countsReported flag`);
if (!/countsReported\s*\?[\s\S]*safety-counter-line/.test(filter)) {
  fail(`${FILTER} must render the counter line only when countsReported is true`);
}

// 4. The layout threads the reported-flag through to the filter.
const layout = read(LAYOUT);
if (!layout.includes("countsReported")) fail(`${LAYOUT} must track and pass countsReported to the filter`);
if (!layout.includes("clearDriverCounts")) fail(`${LAYOUT} must expose clearDriverCounts on the safety UI context`);

console.log("OK verify-safety-driver-cards: driver cards mounted + orphaned counter bar wired (4 checks)");
