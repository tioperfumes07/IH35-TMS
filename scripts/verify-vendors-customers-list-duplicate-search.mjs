#!/usr/bin/env node
/**
 * LST-F3468 — VendorsListView + CustomersListView must not mount page-local TableSearch
 * in CollapsedListFilters searchSlot; ParityTable toolbar owns free-text search.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  "apps/frontend/src/pages/vendors/VendorsListView.tsx",
  "apps/frontend/src/pages/customers/CustomersListView.tsx",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src, label) {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(src.includes("CollapsedListFilters"), `${label}: must keep CollapsedListFilters for chips`);
  assert(!/\bTableSearch\b/.test(src.replace(/\/\/.*$/gm, "")), `${label}: must not import/use TableSearch (ParityTable owns search)`);
  assert(!/searchSlot=/.test(src), `${label}: must not mount searchSlot competing with toolbar Search`);
}

function selftest() {
  for (const rel of PAGES) {
    const full = path.join(ROOT, rel);
    const good = fs.readFileSync(full, "utf8");
    checkPage(good, rel);
    const bad =
      good.replace(
        /dataAttributes=\{\{[^}]+\}\}/,
        `dataAttributes={{ "data-x": "collapsed" }}
            searchSlot={
              <TableSearch value={search} onChange={setSearch} placeholder="Search…" className="w-56" />
            }`,
      ) + "\nimport { TableSearch } from \"../../components/table\";\n";
    let failed = false;
    try {
      checkPage(bad, `${rel}:mut`);
    } catch {
      failed = true;
    }
    assert(failed, `selftest ${rel}: expected FAIL with TableSearch searchSlot`);
  }
  console.log("verify-vendors-customers-list-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-vendors-customers-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    for (const rel of PAGES) {
      checkPage(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel);
    }
    console.log("verify-vendors-customers-list-duplicate-search PASS — both lists ParityTable-owned search");
  } catch (e) {
    console.error(`verify-vendors-customers-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
