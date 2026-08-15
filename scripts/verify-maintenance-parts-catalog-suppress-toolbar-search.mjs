#!/usr/bin/env node
/**
 * MAINT-F3516 — Maintenance Parts Catalog keeps server-bound search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "MaintenancePartsCatalog: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "MaintenancePartsCatalog: must keep server-bound search");
  assert(/search:\s*search\s*\|\|/.test(src), "MaintenancePartsCatalog: must pass search to catalog query");
  assert(/suppressToolbarSearch/.test(src), "MaintenancePartsCatalog: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ MAINT-F3516:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
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
  console.log("verify-maintenance-parts-catalog-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-maintenance-parts-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-maintenance-parts-catalog-suppress-toolbar-search PASS — parts catalog suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-maintenance-parts-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
