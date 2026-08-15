#!/usr/bin/env node
/**
 * LV-ACCOUNTING-CATALOG-DUPLICATE-SEARCH
 * Server-side catalog search in filterBar must pair with suppressToolbarSearch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/accounting/PostingTemplatesListPage.tsx",
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src, label) {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(
    /placeholder=["']Search by code or display name["']/.test(src),
    `${label}: must keep server-side Search by code or display name`,
  );
  assert(
    /suppressToolbarSearch/.test(src),
    `${label}: must pass suppressToolbarSearch so toolbar Search rows… is not competing`,
  );
}

function selftest() {
  for (const rel of PAGES) {
    const full = path.join(ROOT, rel);
    const good = fs.readFileSync(full, "utf8");
    checkPage(good, rel);
    const bad = good.replace(/\n\s*suppressToolbarSearch\n/, "\n");
    let failed = false;
    try {
      checkPage(bad, `${rel}:mut`);
    } catch {
      failed = true;
    }
    assert(failed, `selftest ${rel}: expected FAIL without suppressToolbarSearch`);
  }
  console.log("verify-accounting-catalog-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-accounting-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    for (const rel of PAGES) {
      checkPage(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel);
    }
    console.log("verify-accounting-catalog-suppress-toolbar-search PASS — both catalog hosts suppress toolbar search");
  } catch (e) {
    console.error(`verify-accounting-catalog-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
