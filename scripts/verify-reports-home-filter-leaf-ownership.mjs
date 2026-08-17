#!/usr/bin/env node
/**
 * verify-reports-home-filter-leaf-ownership.mjs
 * LV-REPORTS-HOME-FILTER-LEAF-MISOWNED
 *
 * Reports home Required must NOT claim chrome.toolbar_filter — RunnerFilters
 * mounts only under ReportsRunner; home "Filters" is a FrequentlyRun column sorter.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-home-filter-leaf-ownership";
const REQ = "docs/specs/scoreboard/modules/reports.required.json";
const HOME = "apps/frontend/src/pages/reports/ReportsHome.tsx";
const RUNNER = "apps/frontend/src/pages/reports/ReportsRunner.tsx";
const FREQ = "apps/frontend/src/components/reports/FrequentlyRunTable.tsx";
const LEAF = "chrome.toolbar_filter";
const KEEP = ["chrome.toolbar_search", "chrome.toolbar_range", "chrome.toolbar_gear"];

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const j = JSON.parse(read(REQ));
  const ids = (j.leaves ?? []).map((l) => l.id);
  if (ids.includes(LEAF)) {
    failures.push(`reports.required.json must not claim ${LEAF} on home (RunnerFilters is runner-only)`);
  }
  for (const id of KEEP) {
    if (!ids.includes(id)) {
      failures.push(`reports.required.json must keep real home toolbar leaf ${id}`);
    }
  }
  const block = (j.honesty_audit ?? {}).reports_home_toolbar_filter_2026_08_17;
  if (!block) {
    failures.push("honesty_audit.reports_home_toolbar_filter_2026_08_17 block missing");
  } else {
    const drop = (block.drops ?? []).find((d) => d.id === LEAF);
    if (!drop || !(drop.removed ?? []).includes("qbo_chrome")) {
      failures.push("honesty drop must remove qbo_chrome from chrome.toolbar_filter");
    }
  }

  const home = read(HOME);
  if (/RunnerFilters/.test(home)) {
    failures.push("ReportsHome must not mount RunnerFilters");
  }
  const runner = read(RUNNER);
  if (!/RunnerFilters/.test(runner)) {
    failures.push("ReportsRunner must still mount RunnerFilters (real owner)");
  }
  const freq = read(FREQ);
  if (!/label:\s*"Filters"/.test(freq)) {
    failures.push("FrequentlyRunTable must keep Filters column label (sorter — not staged panel)");
  }
  if (/CollapsedListFilters|useStagedListFilters/.test(freq)) {
    failures.push("FrequentlyRunTable must not mount staged CollapsedListFilters while home filter leaf is dropped");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const reqPath = path.join(process.cwd(), REQ);
  const original = fs.readFileSync(reqPath, "utf8");
  try {
    const j = JSON.parse(original);
    j.leaves = [
      ...(j.leaves ?? []),
      {
        id: LEAF,
        tab: "Chrome controls",
        route_hint: "/reports",
        surface_path: "pages/reports/runners/RunnerFilters.tsx",
        required: ["qbo_chrome"],
      },
    ];
    fs.writeFileSync(reqPath, JSON.stringify(j, null, 2) + "\n");
    const bad = analyze();
    if (!bad.some((m) => /must not claim/.test(m))) {
      fail("selftest expected reclaim of chrome.toolbar_filter to fail");
    }
  } finally {
    fs.writeFileSync(reqPath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} --selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze();
  if (failures.length) {
    for (const m of failures) console.error(`${LABEL} FAIL: ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — Reports home drops misowned toolbar_filter; RunnerFilters stays on runner`);
}

main();
