#!/usr/bin/env node
/**
 * LST-F3514 — Drivers Reference Catalog keeps server-bound search;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(src = fs.readFileSync(path.join(ROOT, PAGE), "utf8")) {
  assert(src.includes("ParityTable"), "DriversReferenceCatalogPage: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "DriversReferenceCatalogPage: must keep server-bound search");
  assert(/search:\s*search\s*\|\|/.test(src), "DriversReferenceCatalogPage: must pass search to list API");
  assert(/suppressToolbarSearch/.test(src), "DriversReferenceCatalogPage: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const bad = good.replace(/\n\s*\/\/ LST-F3514:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
  assert(!/suppressToolbarSearch/.test(bad), "selftest fixture must remove all suppressToolbarSearch tokens");
  let failed = false;
  try {
    check(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-drivers-reference-catalog-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-drivers-reference-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-drivers-reference-catalog-suppress-toolbar-search PASS — drivers reference catalog suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-drivers-reference-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
