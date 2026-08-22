#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.maintenance.failure_codes.list","catalog.maintenance.failure_codes.create","catalog.maintenance.labor_codes.list","catalog.maintenance.labor_codes.create","catalog.maintenance.parts.list","catalog.maintenance.parts.create","catalog.maintenance.priority_levels.list","catalog.maintenance.priority_levels.create","catalog.maintenance.service_tasks.list","catalog.maintenance.service_tasks.create","catalog.maintenance.shop_locations.list","catalog.maintenance.shop_locations.create","catalog.maintenance.vendors.list","catalog.maintenance.vendors.create","catalog.maintenance.work_order_statuses.list","catalog.maintenance.work_order_statuses.create"],"task":"LISTS-F5965-MAINTENANCE-DEDICATED-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-maintenance-dedicated-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  list: "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogListPage.tsx",
  modal: "apps/frontend/src/pages/lists/maintenance/MaintenanceCatalogModal.tsx",
  api: "apps/frontend/src/api/catalogs-maintenance.ts",
  backend: "apps/backend/src/catalogs/maintenance/index.ts",
  factory: "apps/backend/src/catalogs/maintenance/factory.ts",
};
const CATALOGS = [
  ["failure_codes", "failure-codes", "MaintenanceFailureCodesListPage", "maintenanceFailureCodesCatalogClient", "maintenance_failure_codes"],
  ["labor_codes", "labor-codes", "MaintenanceLaborCodesListPage", "maintenanceLaborCodesCatalogClient", "maintenance_labor_codes"],
  ["parts", "parts", "MaintenancePartsListPage", "maintenancePartsCatalogClient", "maintenance_parts"],
  ["priority_levels", "priority-levels", "MaintenancePriorityLevelsListPage", "maintenancePriorityLevelsCatalogClient", "maintenance_priority_levels"],
  ["service_tasks", "service-tasks", "MaintenanceServiceTasksListPage", "maintenanceServiceTasksCatalogClient", "maintenance_service_tasks"],
  ["shop_locations", "shop-locations", "MaintenanceShopLocationsListPage", "maintenanceShopLocationsCatalogClient", "maintenance_shop_locations"],
  ["vendors", "vendors", "MaintenanceVendorsListPage", "maintenanceVendorsCatalogClient", "maintenance_vendors"],
  ["work_order_statuses", "work-order-statuses", "WorkOrderStatusesListPage", "workOrderStatusesCatalogClient", "work_order_statuses"],
];
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(overrides = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, overrides[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(overrides.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  for (const token of ["client.list({ operating_company_id: companyId", "enabled: Boolean(companyId)", "<MaintenanceCatalogModal", "void query.refetch();"]) if (!src.list.includes(token)) failures.push(`shared list missing ${token}`);
  for (const token of ["await client.create(operatingCompanyId, body)", "await client.update(row.id, operatingCompanyId, body)", "await client.deactivate(row.id, operatingCompanyId)", "onSaved();"]) if (!src.modal.includes(token)) failures.push(`shared modal missing ${token}`);
  for (const token of ["app.get(basePath", "app.post(basePath", "withCompanyScope(", "INSERT INTO catalogs.${config.tableName}", "appendCrudAudit("]) if (!src.factory.includes(token)) failures.push(`backend factory missing ${token}`);
  for (const [leafKey, slug, pageName, clientName, tableName] of CATALOGS) {
    const route = `/lists/maintenance/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.maintenance.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.manifest.includes(`path="${route}"`) || !src.manifest.includes(`<${pageName} />`)) failures.push(`${route} must mount ${pageName}`);
    if (!src.api.includes(`export const ${clientName} = createMaintenanceCatalogClient("${slug}")`)) failures.push(`${clientName} must bind ${slug}`);
    if (!src.backend.includes(`tableName: "${tableName}"`) || !src.backend.includes(`urlSegment: "${slug}"`)) failures.push(`${slug} must bind catalogs.${tableName}`);
    const pageFile = `apps/frontend/src/pages/lists/maintenance/${pageName}.tsx`;
    const page = overrides[pageFile] ?? fs.readFileSync(pageFile, "utf8");
    if (!page.includes("<MaintenanceCatalogListPage") || !page.includes(`client={${clientName}}`)) failures.push(`${pageName} must use canonical shared client`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.maintenance.failure_codes.list"', '"id": "catalog.maintenance.failure_codes.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/maintenance/labor-codes"', 'path="/lists/maintenance/labor-codes-broken"')],
    ["list", original.list.replace("operating_company_id: companyId", "operating_company_id: brokenCompanyId")],
    ["modal", original.modal.replace("await client.create(operatingCompanyId, body)", "await client.create(\"\", body)")],
    ["api", original.api.replace('createMaintenanceCatalogClient("priority-levels")', 'createMaintenanceCatalogClient("priority-levels-broken")')],
    ["backend", original.backend.replace('tableName: "maintenance_vendors"', 'tableName: "maintenance_vendors_broken"')],
    ["factory", original.factory.replaceAll("appendCrudAudit(", "appendMissingAudit(")],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  for (const [, , pageName, clientName] of CATALOGS) {
    const file = `apps/frontend/src/pages/lists/maintenance/${pageName}.tsx`;
    if (!audit({ ...original, [file]: fs.readFileSync(file, "utf8").replace(`client={${clientName}}`, "client={brokenClient}") }).length) throw new Error(`page mutation survived: ${pageName}`);
  }
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-maintenance-dedicated-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + CATALOGS.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-maintenance-dedicated-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-maintenance-dedicated-catalog-connectivity-exact PASS — 8 company-scoped Maintenance catalogs × list/create retain mounted canonical CRUD/reload/audit connectivity");
