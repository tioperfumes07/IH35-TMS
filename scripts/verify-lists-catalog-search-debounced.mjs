#!/usr/bin/env node
/**
 * LISTS-CATALOG-SEARCH-FLAKY — Lists catalog server search must debounce (TableSearch) and
 * keepPreviousData so react-query key churn does not flash empty grids mid-typing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = "apps/frontend/src/components/lists/CatalogListSearchInput.tsx";
const OPTIONS = "apps/frontend/src/hooks/catalogListSearchQueryOptions.ts";
const ANCHOR_PAGES = [
  "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/safety/SafetyGenericCatalogListPage.tsx",
  "apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx",
];

const LISTS_GLOB = path.join(ROOT, "apps/frontend/src/pages/lists");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function walkTsx(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsx(full, out);
    else if (ent.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

export function check() {
  const inputSrc = fs.readFileSync(path.join(ROOT, INPUT), "utf8");
  assert(inputSrc.includes("TableSearch"), `${INPUT}: must wrap TableSearch for debounced emit`);
  const optionsSrc = fs.readFileSync(path.join(ROOT, OPTIONS), "utf8");
  assert(/keepPreviousData/.test(optionsSrc), `${OPTIONS}: must export keepPreviousData placeholder`);

  for (const rel of ANCHOR_PAGES) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert(src.includes("CatalogListSearchInput"), `${rel}: must use CatalogListSearchInput`);
    assert(
      src.includes("...catalogListSearchQueryOptions"),
      `${rel}: must spread catalogListSearchQueryOptions on list useQuery`,
    );
    assert(!/setSearch\(event\.target\.value\)/.test(src), `${rel}: raw per-keystroke search forbidden`);
  }

  const catalogPages = walkTsx(LISTS_GLOB).filter((file) => {
    const src = fs.readFileSync(file, "utf8");
    return (
      /placeholder=["']Search by code/.test(src) ||
      /search:\s*search\s*\|\|/.test(src) ||
      /search:\s*search\s*\|\|/.test(src)
    );
  });

  for (const file of catalogPages) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, "utf8");
    assert(!/setSearch\(event\.target\.value\)/.test(src), `${rel}: raw per-keystroke search forbidden`);
    assert(!/setSearch\(e\.target\.value\)/.test(src), `${rel}: raw per-keystroke search forbidden`);
    // Nested pages/lists/<seg>/*.tsx must import via ../../../ — ../../../../ escapes src/ (TS2307 / FE build_failed).
    const underSeg = path.relative(LISTS_GLOB, file).includes(path.sep);
    if (underSeg) {
      assert(
        !/from ["']\.\.\/\.\.\/\.\.\/\.\.\/(components\/lists\/CatalogListSearchInput|hooks\/catalogListSearchQueryOptions)/.test(
          src,
        ),
        `${rel}: nested catalog page must use ../../../ import depth (not ../../../../)`,
      );
    }
    if (/CatalogListSearchInput/.test(src)) continue;
    assert(
      /catalogListSearchQueryOptions/.test(src) || /useMaintenanceServicesCatalog|useMaintenancePartsCatalog/.test(src),
      `${rel}: catalog search host must use CatalogListSearchInput or a hook wired to catalogListSearchQueryOptions`,
    );
  }
}

function selftest() {
  check();
  const anchor = path.join(ROOT, ANCHOR_PAGES[0]);
  const good = fs.readFileSync(anchor, "utf8");
  const bad = good
    .replace("CatalogListSearchInput", "BrokenCatalogSearchInput")
    .replace("...catalogListSearchQueryOptions,", "");
  fs.writeFileSync(anchor, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(anchor, good);
  assert(failed, "selftest: expected FAIL when CatalogListSearchInput removed");

  // Depth regression: plant ../../../../ on a nested safety page.
  const nested = path.join(ROOT, "apps/frontend/src/pages/lists/safety/SafetyGenericCatalogListPage.tsx");
  const nestedGood = fs.readFileSync(nested, "utf8");
  const nestedBad = nestedGood.replace(
    'from "../../../components/lists/CatalogListSearchInput"',
    'from "../../../../components/lists/CatalogListSearchInput"',
  );
  assert(nestedBad !== nestedGood, "selftest: depth plant must change file");
  fs.writeFileSync(nested, nestedBad);
  let depthFailed = false;
  try {
    check();
  } catch {
    depthFailed = true;
  }
  fs.writeFileSync(nested, nestedGood);
  assert(depthFailed, "selftest: expected FAIL on ../../../../ import depth");

  console.log("verify-lists-catalog-search-debounced --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-lists-catalog-search-debounced FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-lists-catalog-search-debounced PASS — debounced catalog search + keepPreviousData wired");
  } catch (e) {
    console.error(`verify-lists-catalog-search-debounced FAIL — ${e.message}`);
    process.exit(1);
  }
}
