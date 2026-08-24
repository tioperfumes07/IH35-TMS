#!/usr/bin/env node
/**
 * COMP-F3484 — FleetHosBoardSection live ParityTable must not mount a page-local
 * filterBar search input; ParityTable toolbar owns free-text search.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("ParityTable")) problems.push("must use ParityTable");
  if (/\[search,\s*setSearch\]/.test(src)) problems.push("must not keep page-local search state");
  if (/fleetHosSearchText/.test(src)) problems.push("must not keep fleetHosSearchText helper");
  if (/filteredLiveRows/.test(src)) problems.push("must not keep filteredLiveRows");
  if (/filterBar=\{[\s\S]*?<input[\s\S]*?type=["']search["']/.test(src)) {
    problems.push("filterBar must not mount type=search input");
  }
  if (!/rows=\{liveRows\}/.test(src)) problems.push("live ParityTable must receive liveRows");
  return problems;
}

export function check() {
  const problems = collectProblems(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
  if (problems.length) throw new Error(`FleetHosBoardSection: ${problems.join("; ")}`);
}

function selftest() {
  const good = "<ParityTable rows={liveRows} />";
  if (collectProblems(good).length) throw new Error("selftest: good fixture must pass");
  const mutations = [
    [good.replace("ParityTable", "LegacyTable"), "must use ParityTable"],
    [`${good} const [search, setSearch] = useState(\"\");`, "page-local search state"],
    [`${good} function fleetHosSearchText(row) { return row.unit_number; }`, "fleetHosSearchText"],
    [`${good} const filteredLiveRows = liveRows;`, "filteredLiveRows"],
    [`${good} filterBar={<input type=\"search\" />}`, "type=search input"],
    [good.replace("rows={liveRows}", "rows={rows}"), "must receive liveRows"],
  ];
  for (const [fixture, expected] of mutations) {
    const problems = collectProblems(fixture);
    if (!problems.some((problem) => problem.includes(expected))) {
      throw new Error(`selftest: ${expected} mutation escaped (${JSON.stringify(problems)})`);
    }
  }
  console.log(`verify-fleet-hos-board-duplicate-search --selftest PASS — ${mutations.length}/${mutations.length} duplicate-search ownership defects detected`);
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-fleet-hos-board-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-fleet-hos-board-duplicate-search PASS — Fleet HOS ParityTable-owned search");
  } catch (e) {
    console.error(`verify-fleet-hos-board-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
