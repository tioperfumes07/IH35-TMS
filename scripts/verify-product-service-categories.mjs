#!/usr/bin/env node
// Block 3 static CI guard — locks the "QBO Categories" → "Product & Service Categories" rename and
// the single-source rule (CLAUDE.md §2). Frontend vitest does NOT run in CI, so this .mjs is the
// real regression gate.
//
// Invariants:
//   (1) The Lists page + AllCatalogsMap label read "Product & Service Categories".
//   (2) Back-compat preserved: catalogKey "qbo-categories" is unchanged.
//   (3) Single source: both QboCategoriesListPage and the Items editor write via
//       qboCategoriesCatalogClient (no divergent category endpoint).
//   (4) The no-account-link helper text is present.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const feRoot = path.join(repoRoot, "apps/frontend/src/pages/lists/accounting");
const pagePath = path.join(feRoot, "QboCategoriesListPage.tsx");
const itemEditorPath = path.join(feRoot, "ItemEditorModal.tsx");
const mapPath = path.join(repoRoot, "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx");

const failures = [];

function read(p, label) {
  if (!fs.existsSync(p)) {
    failures.push(`missing ${label}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const page = read(pagePath, "QboCategoriesListPage.tsx");
if (page) {
  if (!/displayName="Product & Service Categories"/.test(page)) failures.push("QboCategoriesListPage displayName must be \"Product & Service Categories\"");
  if (/displayName="QBO Categories"/.test(page)) failures.push("QboCategoriesListPage must not still show displayName \"QBO Categories\"");
  if (!/qboCategoriesCatalogClient/.test(page)) failures.push("QboCategoriesListPage must use qboCategoriesCatalogClient (single source)");
  if (!/account controls accounting/.test(page)) failures.push("QboCategoriesListPage must show the no-account-link helper text");
}

const itemEditor = read(itemEditorPath, "ItemEditorModal.tsx");
if (itemEditor && !/qboCategoriesCatalogClient\.create/.test(itemEditor)) {
  failures.push("ItemEditorModal '+ New category' must create via qboCategoriesCatalogClient (single source)");
}

const map = read(mapPath, "AllCatalogsMap.tsx");
if (map) {
  const re = /name: "Product & Service Categories"[^}]*catalogKey: "qbo-categories"/;
  if (!re.test(map)) failures.push("AllCatalogsMap must label the entry \"Product & Service Categories\" while keeping catalogKey \"qbo-categories\" (back-compat)");
}

if (failures.length > 0) {
  console.error("verify:product-service-categories — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:product-service-categories — OK");
