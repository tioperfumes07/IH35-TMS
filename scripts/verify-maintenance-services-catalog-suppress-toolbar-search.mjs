#!/usr/bin/env node
/**
 * MAINT-F3506 — Maintenance Services Catalog keeps server-bound search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "MaintenanceServicesCatalog: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "MaintenanceServicesCatalog: must keep server-bound search");
  assert(/search:\s*search\s*\|\|/.test(src), "MaintenanceServicesCatalog: must pass search to catalog query");
  assert(/suppressToolbarSearch/.test(src), "MaintenanceServicesCatalog: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ MAINT-F3506:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
  assert(!/suppressToolbarSearch/.test(bad), "selftest fixture must remove all suppressToolbarSearch tokens");
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-maintenance-services-catalog-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-maintenance-services-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-maintenance-services-catalog-suppress-toolbar-search PASS — services catalog suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-maintenance-services-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
