#!/usr/bin/env node
/**
 * verify-report-runner-empty-filters-theater.mjs
 * LV-REPORT-RUNNER-EMPTY-FILTERS-THEATER
 *
 * Runner configs with filters: [] must not mount empty CollapsedListFilters chrome.
 * Nonempty configs must keep CollapsedListFilters + Run report.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-report-runner-empty-filters-theater";
const RUNNER = "apps/frontend/src/pages/reports/runners/RunnerFilters.tsx";
const CONFIG = "apps/frontend/src/pages/reports/runners/runner-config.ts";
const EMPTY_IDS = ["csa-fleet", "fleet-utilization"];

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function analyzeRunner(src) {
  const failures = [];
  if (!/filters\.length === 0/.test(src) && !/filters\.length===0/.test(src)) {
    failures.push("RunnerFilters must short-circuit when filters.length === 0");
  }
  if (!/data-runner-filter-toolbar="none"/.test(src) && !/data-testid="runner-no-filters"/.test(src)) {
    failures.push("empty path must mark runner-no-filters / toolbar=none");
  }
  // Empty path must not render CollapsedListFilters before returning.
  const emptyBranch = src.match(/if\s*\(\s*filters\.length\s*===\s*0\s*\)\s*\{([\s\S]*?)\n\s*return\s*\(/);
  if (emptyBranch && /CollapsedListFilters/.test(emptyBranch[1] + (src.slice(src.indexOf(emptyBranch[0]), src.indexOf(emptyBranch[0]) + 800)))) {
    // Check the returned JSX of empty branch only
  }
  const emptyReturn = src.match(/if\s*\(\s*filters\.length\s*===\s*0\s*\)\s*\{[\s\S]*?return\s*\(([\s\S]*?)\);\s*\n\s*\}/);
  if (!emptyReturn) {
    failures.push("empty filters early-return block missing");
  } else if (/CollapsedListFilters/.test(emptyReturn[1])) {
    failures.push("empty filters path must not render CollapsedListFilters");
  } else if (!/Run report/.test(emptyReturn[1])) {
    failures.push("empty filters path must retain Run report");
  }
  if (!/CollapsedListFilters/.test(src)) {
    failures.push("nonempty path must still use CollapsedListFilters");
  }
  return failures;
}

function analyzeConfig(src) {
  const failures = [];
  for (const id of EMPTY_IDS) {
    // Allow either "id": { ... filters: [] } or id block spanning lines.
    const re = new RegExp(`"${id}"\\s*:\\s*\\{[\\s\\S]*?filters:\\s*\\[\\s*\\]`);
    if (!re.test(src)) {
      failures.push(`${id} must keep filters: [] (inventory ratchet)`);
    }
  }
  // Control: at least one nonempty filters array remains.
  if (!/filters:\s*\[[\s\S]*?\{[\s\S]*?key:/.test(src)) {
    failures.push("must retain at least one nonempty runner filter config");
  }
  return failures;
}

function selftest() {
  const goodRunner = `
    if (filters.length === 0) {
      return (
        <section data-runner-filter-toolbar="none" data-testid="runner-no-filters">
          <button>Run report</button>
        </section>
      );
    }
    return (
      <CollapsedListFilters onApply={staged.apply}>
        {filters.map(() => null)}
      </CollapsedListFilters>
    );
  `;
  const badRunner = `
    return (
      <CollapsedListFilters>
        {filters.map(() => null)}
      </CollapsedListFilters>
    );
  `;
  const goodConfig = `
    "csa-fleet": {
      id: "csa-fleet",
      filters: [],
      columns: [],
    },
    "fleet-utilization": {
      id: "fleet-utilization",
      filters: [],
      columns: [],
    },
    "detention": { filters: [{ key: "from", type: "date_range" }], columns: [] },
  `;
  if (analyzeRunner(goodRunner).length) fail(`selftest GOOD runner: ${analyzeRunner(goodRunner).join("; ")}`);
  if (!analyzeRunner(badRunner).length) fail("selftest expected BAD runner to fail");
  if (analyzeConfig(goodConfig).length) fail(`selftest GOOD config: ${analyzeConfig(goodConfig).join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const root = process.cwd();
const runnerSrc = fs.readFileSync(path.join(root, RUNNER), "utf8");
const configSrc = fs.readFileSync(path.join(root, CONFIG), "utf8");
const failures = [...analyzeRunner(runnerSrc), ...analyzeConfig(configSrc)];
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — empty runner filters omit CollapsedListFilters`);
