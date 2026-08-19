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

const RUNNER_SURFACE = "pages/reports/runners/RunnerFilters.tsx";

function analyze(overrides = {}) {
  const failures = [];
  const j = JSON.parse(overrides.req ?? read(REQ));
  const leaves = j.leaves ?? [];
  const ids = leaves.map((l) => l.id);
  // The LEAF id itself is not banned outright — a sibling finding (ACCT-F5521,
  // LV-REPORTS-HOME-FILTER-LEAF-MISOWNED's own follow-up, and the cross-module
  // verify-program-system-cashflow-filter-panels.mjs wave check) requires every
  // module's required.json to carry a chrome.toolbar_filter leaf pointing at its
  // real governed CollapsedListFilters surface. Reports' real surface is
  // RunnerFilters.tsx (route_hint "/reports/run/:reportKey"), NOT Reports home
  // (route_hint "/reports") — so the invariant this guard actually protects is
  // narrower: no leaf claiming chrome.toolbar_filter may be owned by HOME.
  for (const leaf of leaves) {
    if (leaf.id !== LEAF) continue;
    const ownedByHome = leaf.route_hint === "/reports" || leaf.surface_path === FREQ.replace("apps/frontend/src/", "");
    const ownedByRunner = leaf.surface_path === RUNNER_SURFACE;
    if (ownedByHome && !ownedByRunner) {
      failures.push(`reports.required.json must not claim ${LEAF} on home (RunnerFilters is runner-only)`);
    }
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

  const home = overrides.home ?? read(HOME);
  if (/RunnerFilters/.test(home)) {
    failures.push("ReportsHome must not mount RunnerFilters");
  }
  const runner = overrides.runner ?? read(RUNNER);
  if (!/RunnerFilters/.test(runner)) {
    failures.push("ReportsRunner must still mount RunnerFilters (real owner)");
  }
  const freq = overrides.freq ?? read(FREQ);
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

// Pure, in-memory selftest — never writes to disk. An earlier version mutated the REAL
// reports.required.json directly (fs.writeFileSync then restored in a finally), which is unsafe:
// Node's process.exit() does NOT run pending finally blocks, so a crash between the write and the
// restore would have left the real registry permanently corrupted (the same class of bug fixed for
// ACCT-F5524/ACCT-F5528). analyze(overrides) now takes in-memory content instead.
function selftest() {
  const originalReq = read(REQ);
  const j = JSON.parse(originalReq);

  // Real, historical mis-owned shape (what LV-REPORTS-HOME-FILTER-LEAF-MISOWNED actually dropped
  // on 2026-08-17): claimed by Reports HOME itself — route_hint "/reports", pointing at the home
  // toolbar's own surface file, not RunnerFilters.
  const misownedReq = JSON.stringify(
    {
      ...j,
      leaves: [
        ...(j.leaves ?? []),
        {
          id: LEAF,
          tab: "Chrome controls",
          route_hint: "/reports",
          surface_path: "components/reports/FrequentlyRunTable.tsx",
          required: ["qbo_chrome"],
        },
      ],
    },
    null,
    2,
  );
  const bad = analyze({ req: misownedReq });
  if (!bad.some((m) => /must not claim/.test(m))) {
    fail("selftest expected home-owned reclaim of chrome.toolbar_filter to fail");
  }

  // Correctly-owned shape (the real, current file): claimed by ReportsRunner, not home — must NOT
  // be flagged. This is exactly the ACCT-F5521 leaf this guard must coexist with.
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD on real tree: ${good.join("; ")}`);

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
