#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.maintenance.labor_rates.list","catalog.maintenance.labor_rates.create","catalog.maintenance.part_locations.list","catalog.maintenance.part_locations.create","catalog.maintenance.air_bag_catalog.list","catalog.maintenance.air_bag_catalog.create","catalog.maintenance.battery_catalog.list","catalog.maintenance.battery_catalog.create","catalog.maintenance.pm_intervals.list","catalog.maintenance.pm_intervals.create","catalog.maintenance.repair_locations.list","catalog.maintenance.repair_locations.create","catalog.maintenance.tire_catalog.list","catalog.maintenance.tire_catalog.create","catalog.maintenance.trailer_parts.list","catalog.maintenance.trailer_parts.create","catalog.maintenance.truck_parts.list","catalog.maintenance.truck_parts.create","catalog.maintenance.work_order_templates.list","catalog.maintenance.work_order_templates.create"],"task":"LISTS-F5966-MAINTENANCE-GENERIC-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-maintenance-generic-catalog-connectivity-exact.mjs";
const LOC_MAP = "apps/frontend/src/components/maintenance/LocationMapModal.tsx";
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
  ["labor_rates", "labor-rates", "laborRatesCatalogConfig"],
  ["maintenance_part_locations", "part_locations", "part-locations", "maintenancePartLocationsCatalogConfig"],
  ["air_bag_catalog", "air-bag-catalog", "airBagCatalogCatalogConfig"],
  ["battery_catalog", "battery-catalog", "batteryCatalogCatalogConfig"],
  ["pm_intervals", "pm-intervals", "pmIntervalsCatalogConfig"],
  ["repair_locations", "repair-locations", "repairLocationsCatalogConfig"],
  ["tire_catalog", "tire-catalog", "tireCatalogCatalogConfig"],
  ["trailer_parts", "trailer-parts", "trailerPartsCatalogConfig"],
  ["truck_parts", "truck-parts", "truckPartsCatalogConfig"],
  ["work_order_templates", "work-order-templates", "workOrderTemplatesCatalogConfig"],
].map((entry) => entry.length === 3 ? [entry[0], entry[0], entry[1], entry[2]] : entry);
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
  for (const [catalogKey, leafKey, slug, configName] of CATALOGS) {
    const route = `/lists/maintenance/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.maintenance.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.hub.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} must remain reachable from Maintenance hub`);
    const registryStart = src.registry.indexOf(`"maintenance.${catalogKey}":`);
    const registryBlock = src.registry.slice(registryStart, registryStart + 1000);
    if (registryStart < 0 || !registryBlock.includes('domain: "maintenance"') || !registryBlock.includes(`catalogKey: "${slug}"`)) failures.push(`${slug} frontend registry missing`);
    const configStart = src.backend.indexOf(`export const ${configName}`);
    const config = src.backend.slice(configStart, configStart + 1800);
    if (configStart < 0 || !config.includes('routePrefix: "/api/v1/catalogs/maintenance"') || !config.includes(`urlSegment: "${slug}"`)) failures.push(`${slug} canonical backend config missing`);
    if (!src.backend.includes(`createCatalogRoutes(app, ${configName}, { mode: "all" })`)) failures.push(`${slug} must mount full generic CRUD`);
  }
  return failures;
}

function leftoverRefuse(src) {
  const hits = [];
  if (src.includes("text-[11px]")) hits.push(`${LOC_MAP}: leftover text-[11px]`);
  if (src.includes("#8A92AB") || src.includes("#334155") || src.includes("#64748b") || src.includes("#94a3b8") || src.includes("#d1d5db") || src.includes("#D1D5DB")) {
    hits.push(`${LOC_MAP}: leftover off-scale muted`);
  }
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-")) {
    hits.push(`${LOC_MAP}: leftover slate class`);
  }
  return hits;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.maintenance.labor_rates.list"', '"id": "catalog.maintenance.labor_rates.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/:domain/:catalogKey"', 'path="/lists/:domain/:broken"')],
    ["hub", original.hub.replace('catalogKey: "part-locations"', 'catalogKey: "part-locations-broken"')],
    ["registry", original.registry.replace('catalogKey: "pm-intervals"', 'catalogKey: "pm-intervals-broken"')],
    ["page", original.page.replace("useCatalogMutations(catalogName ?? \"\", companyId)", "useCatalogMutations(catalogName ?? \"\", \"\")")],
    ["backend", original.backend.replace('urlSegment: "work-order-templates"', 'urlSegment: "work-order-templates-broken"')],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  // BANK-F91294 leftover plant — LocationMapModal page-scoped text token ratchet
  const leftoverHits = leftoverRefuse('<div className="text-[11px] text-[#8A92AB]">plant</div>');
  if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
    throw new Error(`leftover plant escaped: ${JSON.stringify(leftoverHits)}`);
  }
  // BANK-F91510 leftover plant — LocationMapModal leftover slate stroke/label
  const leftoverSlateHits = leftoverRefuse('<text fill="#64748b"></text><rect stroke="#94a3b8" /><div style="border: 1px solid #d1d5db" />');
  if (!leftoverSlateHits.some((e) => e.includes("leftover off-scale muted"))) {
    throw new Error(`leftover slate plant escaped: ${JSON.stringify(leftoverSlateHits)}`);
  }
  // BANK-F91530 leftover plant — LocationMapModal leftover Tailwind slate-* classes
  const leftoverSlateClassHits = leftoverRefuse('<div className="text-slate-700 border-slate-200 bg-slate-50">plant</div>');
  if (!leftoverSlateClassHits.some((e) => e.includes("leftover slate class"))) {
    throw new Error(`leftover slate class plant escaped: ${JSON.stringify(leftoverSlateClassHits)}`);
  }
  console.log(`verify-lists-maintenance-generic-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected + leftover plant`);
  process.exit(0);
}

const failures = audit();
// BANK-F91294 + BANK-F91510 leftover refuse — LocationMapModal.tsx page-scoped muted ratchet
failures.push(...leftoverRefuse(fs.readFileSync(LOC_MAP, "utf8")));
if (failures.length) { console.error(`verify-lists-maintenance-generic-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-maintenance-generic-catalog-connectivity-exact PASS — 10 Maintenance catalogs × list/create retain hub→stable route→selected-company CRUD/reload connectivity");
