#!/usr/bin/env node
/**
 * ASSET-F3482 — AssetsWorkspace: AssetFiltersBar must not mount searchSlot;
 * AssetListTable ParityTable owns free-text search.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/assets/AssetFiltersBar.tsx",
  "apps/frontend/src/pages/assets/AssetsWorkspacePage.tsx",
  "apps/frontend/src/components/assets/AssetListTable.tsx",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const filters = fs.readFileSync(path.join(ROOT, FILES[0]), "utf8");
  const page = fs.readFileSync(path.join(ROOT, FILES[1]), "utf8");
  const table = fs.readFileSync(path.join(ROOT, FILES[2]), "utf8");

  assert(table.includes("ParityTable"), "AssetListTable: must use ParityTable");
  assert(!/searchSlot=/.test(filters), "AssetFiltersBar: must not mount searchSlot");
  assert(!/\bsearch\b/.test(filters.replace(/\/\/.*$/gm, "")), "AssetFiltersBar: must not take search props");
  assert(!/\[search,\s*setSearch\]/.test(page), "AssetsWorkspacePage: must not keep page-local search state");
  assert(/AssetFiltersBar[^>]*lifecycle=/.test(page) || page.includes("<AssetFiltersBar"), "AssetsWorkspacePage: must keep AssetFiltersBar");
}

function selftest() {
  check();
  const filtersPath = path.join(ROOT, FILES[0]);
  const good = fs.readFileSync(filtersPath, "utf8");
  const bad =
    good.replace(
      /applyDisabled=\{!staged\.dirty\}/,
      `applyDisabled={!staged.dirty}
        searchSlot={
          <input value={search} onChange={() => {}} placeholder="Unit number, VIN, driver, or location" />
        }`,
    ) + "\nsearch: string;\n";
  fs.writeFileSync(filtersPath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filtersPath, good);
  assert(failed, "selftest: expected FAIL with searchSlot restored");
  console.log("verify-assets-workspace-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-assets-workspace-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-assets-workspace-duplicate-search PASS — Assets ParityTable-owned search");
  } catch (e) {
    console.error(`verify-assets-workspace-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
