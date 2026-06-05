#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HAND_ROLLED_MARKERS = [
  "FleetCatalogListPage",
  "FuelCatalogListPage",
  "MaintenanceCatalogListPage",
  "DriversReferenceCatalogPage",
  "createFleetCatalogClient",
  "createFuelCatalogClient",
  "createMaintenanceCatalogClient",
];

const REQUIRED_GENERIC_MARKERS = ["GenericCatalogPage", "CatalogTable", "CatalogEditModal"];

/** Keep in sync with GENERIC_CATALOG_REGISTRY in useCatalogQuery.ts */
const FACTORY_CATALOGS = [
  {
    catalogName: "fleet.equipment_types",
    domain: "fleet",
    catalogKey: "equipment-types",
    legacyPage: "apps/frontend/src/pages/lists/fleet/EquipmentTypesListPage.tsx",
  },
];

const LEGACY_ALLOWED = new Set(FACTORY_CATALOGS.map((entry) => entry.legacyPage));

function fail(message) {
  console.error(`verify:catalog-pages-use-generic-framework FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

function walkTsxFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsxFiles(full, acc);
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".test.tsx")) continue;
    acc.push(full);
  }
  return acc;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

const hookSource = read("apps/frontend/src/hooks/useCatalogQuery.ts");
const genericPage = read("apps/frontend/src/pages/lists/GenericCatalogPage.tsx");
const catalogIndex = read("apps/frontend/src/pages/lists/CatalogIndex.tsx");

for (const marker of REQUIRED_GENERIC_MARKERS) {
  if (!genericPage.includes(marker)) {
    fail(`GenericCatalogPage.tsx must reference ${marker}`);
  }
}

if (!catalogIndex.includes("GenericCatalogPage") && !catalogIndex.includes("catalogNameToRoutePath")) {
  fail("CatalogIndex.tsx must link factory catalogs via catalogNameToRoutePath");
}

for (const catalog of FACTORY_CATALOGS) {
  if (!hookSource.includes(`"${catalog.catalogName}"`)) {
    fail(`useCatalogQuery.ts missing registry entry for ${catalog.catalogName}`);
  }
  const expectedRoute = `/lists/${catalog.domain}/${catalog.catalogKey}`;
  if (!catalogIndex.includes(expectedRoute) && !hookSource.includes(`catalogKey: "${catalog.catalogKey}"`)) {
    fail(`Catalog index/registry missing route ${expectedRoute}`);
  }
}

const listsRoot = path.join(ROOT, "apps/frontend/src/pages/lists");
const listPages = walkTsxFiles(listsRoot).map(relative);

for (const catalog of FACTORY_CATALOGS) {
  const slug = catalog.catalogKey.replace(/-/g, "");
  const suspects = listPages.filter((filePath) => {
    if (LEGACY_ALLOWED.has(filePath)) return false;
    if (filePath.includes("GenericCatalogPage.tsx")) return false;
    if (filePath.includes("CatalogIndex.tsx")) return false;
    const base = path.basename(filePath, ".tsx").toLowerCase().replace(/[^a-z0-9]/g, "");
    return base.includes(slug) || base.includes(catalog.catalogKey.replace(/-/g, ""));
  });

  for (const suspect of suspects) {
    const source = read(suspect);
    const usesGeneric = source.includes("GenericCatalogPage");
    const usesHandRolled = HAND_ROLLED_MARKERS.some((marker) => source.includes(marker));
    if (usesHandRolled && !usesGeneric) {
      fail(
        `${suspect} appears to be a hand-rolled CRUD page for factory catalog ${catalog.catalogName}; use GenericCatalogPage instead.`
      );
    }
  }
}

console.log("verify:catalog-pages-use-generic-framework PASS");
