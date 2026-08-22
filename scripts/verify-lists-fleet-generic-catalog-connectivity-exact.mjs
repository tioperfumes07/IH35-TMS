#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.fleet.tractor_statuses.list","catalog.fleet.tractor_statuses.create","catalog.fleet.trailer_statuses.list","catalog.fleet.trailer_statuses.create","catalog.fleet.condition_codes.list","catalog.fleet.condition_codes.create","catalog.fleet.equipment_types.list","catalog.fleet.equipment_types.create","catalog.fleet.ownership_types.list","catalog.fleet.ownership_types.create","catalog.fleet.trailer_types.list","catalog.fleet.trailer_types.create","catalog.fleet.lease_terms.list","catalog.fleet.lease_terms.create","catalog.fleet.asset_statuses.list","catalog.fleet.asset_statuses.create","catalog.fleet.asset_locations.list","catalog.fleet.asset_locations.create"],"task":"LISTS-F5968-FLEET-GENERIC-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-fleet-generic-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  registry: "apps/frontend/src/hooks/useCatalogQuery.ts",
  page: "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
  backend: "apps/backend/src/catalogs/fleet/index.ts",
  factory: "apps/backend/src/catalogs/fleet/factory.ts",
};
const CATALOGS = [
  ["tractor_statuses", "tractor-statuses", "tractor_statuses", "Tractor Status"],
  ["trailer_statuses", "trailer-statuses", "trailer_statuses", "Trailer Status"],
  ["condition_codes", "condition-codes", "asset_condition_codes", "Asset Condition Code"],
  ["equipment_types", "equipment-types", "equipment_types", "Display Name"],
  ["ownership_types", "ownership-types", "unit_ownership_types", "Unit Ownership Type"],
  ["trailer_types", "trailer-types", "trailer_types", "Trailer Type"],
  ["lease_terms", "lease-terms", "lease_terms", "Lease Term"],
  ["asset_statuses", "asset-statuses", "asset_statuses", "Asset Status"],
  ["asset_locations", "asset-locations", "asset_locations", "Asset Location"],
];
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  if (!src.manifest.includes('path="/lists/:domain/:catalogKey"') || !src.manifest.includes("<GenericCatalogPage />")) failures.push("stable Lists route must mount GenericCatalogPage");
  if (!src.page.includes("useCatalogQuery({") || !src.page.includes("companyId,") || !src.page.includes('useCatalogMutations(catalogName ?? "", companyId)') || !src.page.includes("+ Create")) failures.push("generic page must scope reads and expose create");
  if (!src.registry.includes("createCatalogRow(catalogName, companyId, body)") || !src.registry.includes("operating_company_id: companyId") || !src.registry.includes('invalidateQueries({ queryKey: ["catalog", catalogName] })')) failures.push("generic CRUD must write selected company and reload");
  if (!src.factory.includes("withCompanyScope(userId, operatingCompanyId, fn)") || !src.factory.includes("appendCrudAudit") || !src.factory.includes("SET is_active = false") || !src.factory.includes("operating_company_id = $")) failures.push("fleet factory must retain scoped CRUD, audit, and void-not-delete");
  for (const [leafKey, slug, table, singularLabel] of CATALOGS) {
    const route = `/lists/fleet/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.fleet.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.hub.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} must remain reachable from Fleet hub`);
    const registryName = `fleet.${table}`;
    const registryStart = src.registry.indexOf(`"${registryName}":`);
    const registryBlock = src.registry.slice(registryStart, registryStart + 1100);
    if (registryStart < 0 || !registryBlock.includes('domain: "fleet"') || !registryBlock.includes(`catalogKey: "${slug}"`) || !registryBlock.includes(`label: "${singularLabel}"`)) failures.push(`${slug} frontend registry/label missing`);
    const configStart = src.backend.indexOf(`tableName: "${table}"`);
    const config = src.backend.slice(configStart, configStart + 420);
    if (configStart < 0 || !config.includes(`urlSegment: "${slug}"`) || !config.includes('routePrefix: "/api/v1/catalogs/fleet"') || !config.includes("companyScoped: true")) failures.push(`${slug} canonical company-scoped backend config missing`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.fleet.tractor_statuses.list"', '"id": "catalog.fleet.tractor_statuses.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/:domain/:catalogKey"', 'path="/lists/:domain/:broken"')],
    ["hub", original.hub.replace('catalogKey: "asset-locations"', 'catalogKey: "asset-locations-broken"')],
    ["registry", original.registry.replace('"fleet.lease_terms": {', '"fleet.lease_terms_broken": {')],
    ["registry", original.registry.replace('"fleet.tractor_statuses": {', '"fleet.tractor_statuses_broken": {')],
    ["page", original.page.replace('useCatalogMutations(catalogName ?? "", companyId)', 'useCatalogMutations(catalogName ?? "", "")')],
    ["backend", original.backend.replace('urlSegment: "ownership-types"', 'urlSegment: "ownership-types-broken"')],
    ["factory", original.factory.replace("withCompanyScope(userId, operatingCompanyId, fn)", "withCurrentUser(userId, fn)")],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-fleet-generic-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-fleet-generic-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-fleet-generic-catalog-connectivity-exact PASS — 9 Fleet catalogs × list/create retain hub→stable route→selected-company CRUD/reload/audit connectivity");
