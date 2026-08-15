#!/usr/bin/env node
/**
 * MAINT-F3526 — Maintenance Vendors keeps server-bound search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "VendorsPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "VendorsPage: must keep server-bound search");
  assert(/listMaintenanceVendors\([^)]*\{\s*search\s*\}/.test(src), "VendorsPage: must pass search to listMaintenanceVendors");
  assert(/suppressToolbarSearch/.test(src), "VendorsPage: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ MAINT-F3526:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
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
  console.log("verify-maint-vendors-suppress-toolbar-search --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-maint-vendors-suppress-toolbar-search PASS");
}
