#!/usr/bin/env node
/**
 * LST-F3480 — CatalogTable must not mount page-local search in filterBar;
 * ParityTable toolbar owns free-text search. Status SelectCombobox stays.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/catalogs/CatalogTable.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src) {
  assert(src.includes("ParityTable"), "CatalogTable: must use ParityTable");
  assert(src.includes("SelectCombobox"), "CatalogTable: must keep status SelectCombobox");
  assert(
    !/placeholder=\{`Search/.test(src) && !/placeholder=["']Search /.test(src),
    "CatalogTable: must not mount page-local Search input in filterBar",
  );
  assert(!/\[search,\s*setSearch\]/.test(src), "CatalogTable: must not keep page-local search state");
}

function selftest() {
  const full = path.join(ROOT, PAGE);
  const good = fs.readFileSync(full, "utf8");
  checkPage(good);
  const bad =
    good.replace(
      /filterBar=\{\s*<div className="grid gap-2 md:grid-cols-3">/,
      `filterBar={
          <div className="grid gap-2 md:grid-cols-3">
            <input value={search} onChange={() => {}} placeholder={\`Search rows\`} className="h-9" />`,
    ) + "\nconst [search, setSearch] = useState(\"\");\n";
  let failed = false;
  try {
    checkPage(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL with page-local search");
  console.log("verify-catalog-table-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-catalog-table-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
    console.log("verify-catalog-table-duplicate-search PASS — CatalogTable ParityTable-owned search");
  } catch (e) {
    console.error(`verify-catalog-table-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
