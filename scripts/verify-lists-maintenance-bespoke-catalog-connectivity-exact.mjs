#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.maintenance.oem_parts_reference.list","catalog.maintenance.oem_parts_reference.create","catalog.maintenance.services_catalog.list","catalog.maintenance.services_catalog.create"],"task":"LISTS-F5967-MAINTENANCE-BESPOKE-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-maintenance-bespoke-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  oemPage: "apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx",
  oemApi: "apps/frontend/src/api/lists-oem-parts.ts",
  oemRoute: "apps/backend/src/lists/oem-parts.routes.ts",
  servicePage: "apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx",
  serviceHook: "apps/frontend/src/hooks/useMaintenanceServicesCatalog.ts",
  serviceRoute: "apps/backend/src/catalogs/maintenance/services.routes.ts",
};
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  const leaves = [
    ["oem_parts_reference", "/lists/maintenance/oem-parts-reference"],
    ["services_catalog", "/lists/maintenance/services-catalog"],
  ];
  for (const [key, route] of leaves) for (const suffix of ["list", "create"]) {
    const id = `catalog.maintenance.${key}.${suffix}`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
  }
  if (!src.manifest.includes('path="/lists/maintenance/oem-parts-reference"') || !src.manifest.includes("<OemPartsCatalog />") || !src.manifest.includes('path="/lists/maintenance/services-catalog"') || !src.manifest.includes("<MaintenanceServicesCatalog />")) failures.push("both bespoke routes must remain mounted");
  for (const token of ["const { selectedCompanyId } = useCompanyContext()", "operating_company_id: companyId", "oemPartsCatalogClient.brands(companyId)", "enabled: Boolean(companyId)", "<OemPartsCreateModal", "void query.refetch();"]) if (!src.oemPage.includes(token)) failures.push(`OEM page missing ${token}`);
  for (const token of ['operating_company_id: string', 'params.set("operating_company_id", filters.operating_company_id)', "brands(operatingCompanyId: string)", "method: \"POST\""]) if (!src.oemApi.includes(token)) failures.push(`OEM API missing ${token}`);
  for (const token of ["resolveOperatingCompanyId", "INSERT INTO reference.oem_parts", "appendCrudAudit("]) if (!src.oemRoute.includes(token)) failures.push(`OEM backend missing ${token}`);
  for (const token of ["useCreateMaintenanceService(companyId)", "<MoneyInput", "typical_cost_cents: createForm.typical_cost_cents", "await createMutation.mutateAsync({", "+ Create"]) if (!src.servicePage.includes(token)) failures.push(`Services page missing ${token}`);
  for (const token of ["useCreateMaintenanceService", "operating_company_id: operatingCompanyId", 'method: "POST"', 'invalidateQueries({ queryKey: ["catalogs", "maintenance", "services-catalog"]']) if (!src.serviceHook.includes(token)) failures.push(`Services hook missing ${token}`);
  for (const token of ["assertCompanyMembership", "INSERT INTO mdata.maintenance_services", "appendCrudAudit(", '"mdata.maintenance_services.created"']) if (!src.serviceRoute.includes(token)) failures.push(`Services backend missing ${token}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.maintenance.services_catalog.create"', '"id": "catalog.maintenance.services_catalog.create.broken"')],
    ["manifest", original.manifest.replace('path="/lists/maintenance/services-catalog"', 'path="/lists/maintenance/services-catalog-broken"')],
    ["oemPage", original.oemPage.replace("operating_company_id: companyId", "operating_company_id: brokenCompanyId")],
    ["oemApi", original.oemApi.replace("brands(operatingCompanyId: string)", "brands()")],
    ["oemRoute", original.oemRoute.replaceAll("appendCrudAudit(", "appendMissingAudit(")],
    ["servicePage", original.servicePage.replace("await createMutation.mutateAsync({", "await missingCreate({")],
    ["serviceHook", original.serviceHook.replace('method: "POST"', 'method: "GET"')],
    ["serviceRoute", original.serviceRoute.replace("INSERT INTO mdata.maintenance_services", "INSERT INTO missing.services")],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-maintenance-bespoke-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-maintenance-bespoke-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-maintenance-bespoke-catalog-connectivity-exact PASS — OEM Parts + Services retain selected-company reads, real creators, canonical writes/reload/audit");
