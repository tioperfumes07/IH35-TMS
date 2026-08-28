#!/usr/bin/env node
/**
 * DRV-F3504 — Drivers roster keeps server-bound name search (listDrivers);
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
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
  assert(/\[search,\s*setSearch\]/.test(src), "Drivers.tsx: must keep server-bound search state");
  assert(/listAllDrivers\(\{[\s\S]*?operating_company_id: selectedCompanyId,[\s\S]*?status: "All",[\s\S]*?search,/.test(src), "Drivers.tsx: must pass selected-company search to complete listAllDrivers reader");
  assert(/suppressToolbarSearch/.test(src), "Drivers.tsx: must pass suppressToolbarSearch");
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  check(good);
  const mutations = [
    ["complete-reader", /listAllDrivers\(/, "listDrivers("],
    ["company-scope", /operating_company_id: selectedCompanyId,/, "operating_company_id: undefined,"],
    ["server-search", /\n\s*search,\n/, "\n"],
    ["duplicate-toolbar", /\n\s*\/\/ DRV-F3504:[^\n]*\n\s*suppressToolbarSearch\n/, "\n"],
  ];
  for (const [name, pattern, replacement] of mutations) {
    const bad = good.replace(pattern, replacement);
    assert(bad !== good, `selftest fixture must plant ${name}`);
    let failed = false;
    try { check(bad); } catch { failed = true; }
    assert(failed, `selftest: expected FAIL for ${name}`);
  }
  console.log("verify-drivers-roster-suppress-toolbar-search --selftest PASS — 4 mutations detected");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-drivers-roster-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-drivers-roster-suppress-toolbar-search PASS — Drivers roster suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-drivers-roster-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
