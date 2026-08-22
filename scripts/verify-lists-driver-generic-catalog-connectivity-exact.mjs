#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.drivers.leave_types.list","catalog.drivers.leave_types.create","catalog.drivers.cash_advance_types.list","catalog.drivers.cash_advance_types.create"],"task":"LISTS-F5964-DRIVER-GENERIC-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-driver-generic-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  registry: "apps/frontend/src/hooks/useCatalogQuery.ts",
  page: "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
  backend: "apps/backend/src/catalogs/generic-catalog.routes.ts",
};
const CATALOGS = [
  ["leave_types", "leave-types", "leaveTypesCatalogConfig"],
  ["cash_advance_types", "cash-advance-types", "cashAdvanceTypesCatalogConfig"],
];
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  if (!src.manifest.includes('path="/lists/:domain/:catalogKey"') || !src.manifest.includes("catalogKeyToCatalogName(registryDomain, catalogKey)") || !src.manifest.includes("<GenericCatalogPage />")) failures.push("stable Lists path must resolve registry catalogs to GenericCatalogPage");
  if (!src.page.includes("useCatalogQuery({") || !src.page.includes("companyId,") || !src.page.includes("useCatalogMutations(catalogName ?? \"\", companyId)") || !src.page.includes("+ Create")) failures.push("GenericCatalogPage must scope reads and expose real create");
  if (!src.registry.includes("createCatalogRow(catalogName, companyId, body)") || !src.registry.includes('operating_company_id: companyId') || !src.registry.includes("invalidateQueries({ queryKey: [\"catalog\", catalogName] })")) failures.push("generic CRUD must use selected company then reload");
  for (const [leafKey, slug, configName] of CATALOGS) {
    const route = `/lists/driver/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.drivers.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.hub.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} must remain reachable from Drivers hub`);
    const registryStart = src.registry.indexOf(`"driver.${leafKey}":`);
    const registryBlock = src.registry.slice(registryStart, registryStart + 1000);
    if (registryStart < 0 || !registryBlock.includes('domain: "driver"') || !registryBlock.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} frontend registry missing`);
    const configStart = src.backend.indexOf(`export const ${configName}`);
    const config = src.backend.slice(configStart, configStart + 1800);
    if (configStart < 0 || !config.includes('routePrefix: "/api/v1/catalogs/driver"') || !config.includes(`urlSegment: "${slug}"`) || !config.includes(`tableName: "${leafKey}"`)) failures.push(`${slug} canonical backend config missing`);
    if (!src.backend.includes(`createCatalogRoutes(app, ${configName}, { mode: "all" })`)) failures.push(`${slug} must mount full generic CRUD`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.drivers.leave_types.list"', '"id": "catalog.drivers.leave_types.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/:domain/:catalogKey"', 'path="/lists/:domain/:broken"')],
    ["hub", original.hub.replace('catalogKey: "cash-advance-types"', 'catalogKey: "cash-advance-types-broken"')],
    ["registry", original.registry.replace('catalogKey: "leave-types"', 'catalogKey: "leave-types-broken"')],
    ["page", original.page.replace("useCatalogMutations(catalogName ?? \"\", companyId)", "useCatalogMutations(catalogName ?? \"\", \"\")")],
    ["backend", original.backend.replace('urlSegment: "cash-advance-types"', 'urlSegment: "cash-advance-types-broken"')],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-driver-generic-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-driver-generic-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-driver-generic-catalog-connectivity-exact PASS — leave/cash-advance types × list/create retain hub→stable route→selected-company CRUD/reload connectivity");
