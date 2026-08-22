#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.customers.customer_types.list","catalog.customers.customer_types.create","catalog.customers.customer_quality_event_reasons.list","catalog.customers.customer_quality_event_reasons.create","catalog.vendors.vendor_types.list","catalog.vendors.vendor_types.create"],"task":"LISTS-F5970-CUSTOMER-VENDOR-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-customer-vendor-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  registry: "apps/frontend/src/hooks/useCatalogQuery.ts",
  page: "apps/frontend/src/pages/lists/GenericCatalogPage.tsx",
  backend: "apps/backend/src/catalogs/generic-catalog.routes.ts",
  factory: "apps/backend/src/catalogs/generic-catalog.factory.ts",
};
const CATALOGS = [
  ["customers", "customer_types", "customer-types", "customerTypesCatalogConfig"],
  ["customers", "customer_quality_event_reasons", "customer-quality-event-reasons", "customerQualityEventReasonsCatalogConfig"],
  ["vendors", "vendor_types", "vendor-types", "vendorTypesCatalogConfig"],
];
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  if (!src.manifest.includes('path="/lists/:domain/:catalogKey"') || !src.manifest.includes("<GenericCatalogPage />")) failures.push("stable Lists generic route missing");
  if (!src.page.includes("useCatalogQuery({") || !src.page.includes("companyId,") || !src.page.includes("+ Create") || !src.page.includes("void query.refetch()")) failures.push("selected-company list/create/reload page missing");
  for (const token of ["withCompanyScope", "appendCrudAudit", "operating_company_id", "isCatalogWriteRole", "createCatalogRoutes"]) if (!src.factory.includes(token)) failures.push(`generic factory missing ${token}`);
  for (const [domain, key, slug, configName] of CATALOGS) {
    const route = `/lists/${domain}/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.${domain}.${key}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.hub.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} hub tile missing`);
    const registryStart = src.registry.indexOf(`"${domain}.${key}":`);
    const registryBlock = src.registry.slice(registryStart, registryStart + 1200);
    if (registryStart < 0 || !registryBlock.includes(`domain: "${domain}"`) || !registryBlock.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} frontend registry missing`);
    const configStart = src.backend.indexOf(`export const ${configName}`);
    const config = src.backend.slice(configStart, configStart + 2000);
    if (configStart < 0 || !config.includes(`routePrefix: "/api/v1/catalogs/${domain}"`) || !config.includes(`urlSegment: "${slug}"`)) failures.push(`${slug} backend config missing`);
    if (!src.backend.includes(`createCatalogRoutes(app, ${configName}, { mode: "all" })`)) failures.push(`${slug} full CRUD mount missing`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.customers.customer_types.create"', '"id": "catalog.customers.customer_types.create.broken"')],
    ["manifest", original.manifest.replace('path="/lists/:domain/:catalogKey"', 'path="/lists/:domain/:broken"')],
    ["hub", original.hub.replace('catalogKey: "vendor-types"', 'catalogKey: "vendor-types-broken"')],
    ["registry", original.registry.replace('"customers.customer_types": {', '"customers.customer_types_broken": {')],
    ["page", original.page.replace("+ Create", "+ Broken")],
    ["backend", original.backend.replace("createCatalogRoutes(app, vendorTypesCatalogConfig, { mode: \"all\" })", "createCatalogRoutes(app, vendorTypesCatalogConfig, { mode: \"extensions\" })")],
    ["factory", original.factory.replaceAll("appendCrudAudit", "appendAuditBroken")],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-customer-vendor-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-customer-vendor-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-customer-vendor-catalog-connectivity-exact PASS — 3 selected-company catalogs × list/create retain canonical CRUD/reload/audit connectivity");
