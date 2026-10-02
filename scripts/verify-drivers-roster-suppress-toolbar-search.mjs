#!/usr/bin/env node
/**
 * DRV-F3504 — Drivers roster has ONE search, never two competing ones.
 * Re-anchored 2026-10-02 to the round 296 filter law (the filename stays: registered verify-step 3504). The roster
 * loads the WHOLE company once through the complete reader (listAllDrivers, every status); the status chips count that
 * roster; the ONE search is the house toolbar (ParityTable's UniversalListToolbar) over it, with "N of M". The old
 * shape -- a page box re-querying the server per keystroke + suppressToolbarSearch -- skewed the chip counts while
 * typing and did nothing on the Profiles tab.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/Drivers.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(source) {
  const src = source ?? fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "Drivers.tsx: must use ParityTable");
  assert(
    /listAllDrivers\(\{[\s\S]*?operating_company_id: selectedCompanyId,[\s\S]*?status: "All",/.test(src),
    "Drivers.tsx: must read the complete selected-company roster through listAllDrivers"
  );
  assert(!/\[search,\s*setSearch\]/.test(src), "Drivers.tsx: a second, page-level search state is back");
  const roster = src.match(/<ParityTable\s+rows=\{driversRowsFiltered\}[\s\S]*?\/>/)?.[0] ?? "";
  assert(roster.length > 0, "Drivers.tsx: roster ParityTable not found");
  assert(!/suppressToolbarSearch/.test(roster), "Drivers.tsx: the roster must not suppress the house toolbar search");
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  check(good);
  const mutations = [
    ["complete-reader", /listAllDrivers\(/, "listDrivers("],
    ["company-scope", /operating_company_id: selectedCompanyId,/, "operating_company_id: undefined,"],
    ["second-search", /(export function \w+\([^)]*\) \{\n)/, '$1  const [search, setSearch] = useState("");\n'],
    ["suppressed-toolbar", /emptyText="No drivers found\."/, 'emptyText="No drivers found."\n                  suppressToolbarSearch'],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const bad = good.replace(pattern, replacement);
    assert(bad !== good, `selftest fixture must plant ${name}`);
    let failed = false;
    try { check(bad); } catch { failed = true; }
    assert(failed, `selftest: expected FAIL for ${name}`);
  }
  console.log(`verify-drivers-roster-suppress-toolbar-search --selftest PASS — ${mutations.length} mutations detected`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    check();
    console.log("verify-drivers-roster-suppress-toolbar-search PASS — one search: the house toolbar over the complete roster");
  }
} catch (e) {
  console.error(`verify-drivers-roster-suppress-toolbar-search FAIL — ${e.message}`);
  process.exit(1);
}
