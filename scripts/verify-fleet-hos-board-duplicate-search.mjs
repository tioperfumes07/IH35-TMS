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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  assert(src.includes("ParityTable"), "FleetHosBoardSection: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "FleetHosBoardSection: must not keep page-local search state");
  assert(!/fleetHosSearchText/.test(src), "FleetHosBoardSection: must not keep fleetHosSearchText helper");
  assert(!/filteredLiveRows/.test(src), "FleetHosBoardSection: must not keep filteredLiveRows");
  assert(
    !/filterBar=\{[\s\S]*?<input[\s\S]*?type=["']search["']/.test(src),
    "FleetHosBoardSection: filterBar must not mount type=search input",
  );
  assert(/rows=\{liveRows\}/.test(src), "FleetHosBoardSection: live ParityTable must receive liveRows");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, FILE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(
    /rows=\{liveRows\}/,
    `rows={filteredLiveRows}
  const [search, setSearch] = useState("");
  function fleetHosSearchText(r) { return r.unit_number; }
  const filteredLiveRows = liveRows;
  filterBar={<input type="search" value={search} onChange={() => {}} />}`,
  );
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL with filterBar search restored");
  console.log("verify-fleet-hos-board-duplicate-search --selftest PASS");
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
