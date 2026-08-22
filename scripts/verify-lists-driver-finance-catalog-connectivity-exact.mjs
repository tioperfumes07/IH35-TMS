#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.drivers.pay_rate_templates.list","catalog.drivers.pay_rate_templates.create","catalog.drivers.deduction_types.list","catalog.drivers.deduction_types.create","catalog.drivers.pay_types.list","catalog.drivers.pay_types.create","catalog.drivers.escrow_types.list","catalog.drivers.escrow_types.create"],"task":"LISTS-F5961-DRIVER-FINANCE-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-driver-finance-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  list: "apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx",
  modal: "apps/frontend/src/pages/lists/driver/DriverCatalogModal.tsx",
  api: "apps/frontend/src/api/catalogs-driver.ts",
  backend: "apps/backend/src/catalogs/driver/index.ts",
  factory: "apps/backend/src/catalogs/driver/factory.ts",
};
const CATALOGS = [
  ["pay_rate_templates", "pay-rate-templates", "PayRateTemplatesListPage", "payRateTemplatesCatalogClient", "pay_rate_templates"],
  ["deduction_types", "deduction-types", "DriverDeductionTypesListPage", "driverDeductionTypesCatalogClient", "driver_deduction_types"],
  ["pay_types", "pay-types", "DriverPayTypesListPage", "driverPayTypesCatalogClient", "driver_pay_types"],
  ["escrow_types", "escrow-types", "EscrowTypesListPage", "escrowTypesCatalogClient", "escrow_types"],
];
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(overrides = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, overrides[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(overrides.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  for (const token of ["client.list({", "operating_company_id: companyId", "<DriverCatalogModal", "void query.refetch();"]) if (!src.list.includes(token)) failures.push(`shared list missing ${token}`);
  for (const token of ["await client.create(operatingCompanyId, body)", "onSaved();", "onClose();"]) if (!src.modal.includes(token)) failures.push(`shared modal missing ${token}`);
  for (const token of ["app.get(basePath", "app.post(basePath", "withCompanyScope(", "INSERT INTO catalogs.${config.tableName}", "appendCrudAudit("]) if (!src.factory.includes(token)) failures.push(`backend factory missing ${token}`);

  for (const [leafKey, slug, pageName, clientName, tableName] of CATALOGS) {
    const route = `/lists/driver/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.drivers.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.manifest.includes(`path="${route}"`) || !src.manifest.includes(`<${pageName} />`)) failures.push(`${route} must mount ${pageName}`);
    if (!src.api.includes(`export const ${clientName} = createDriverCatalogClient("${slug}")`)) failures.push(`${clientName} must bind ${slug}`);
    if (!src.backend.includes(`tableName: "${tableName}"`) || !src.backend.includes(`urlSegment: "${slug}"`)) failures.push(`${slug} must bind catalogs.${tableName}`);
    const pageFile = `apps/frontend/src/pages/lists/driver/${pageName}.tsx`;
    const page = overrides[pageFile] ?? fs.readFileSync(pageFile, "utf8");
    if (!page.includes("<DriverCatalogListPage") || !page.includes(`client={${clientName}}`)) failures.push(`${pageName} must use canonical shared client`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.drivers.pay_rate_templates.list"', '"id": "catalog.drivers.pay_rate_templates.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/driver/deduction-types"', 'path="/lists/driver/deduction-types-broken"')],
    ["list", original.list.replace("operating_company_id: companyId", "operating_company_id: brokenCompanyId")],
    ["modal", original.modal.replace("await client.create(operatingCompanyId, body)", "await client.create(\"\", body)")],
    ["api", original.api.replace('createDriverCatalogClient("pay-types")', 'createDriverCatalogClient("pay-types-broken")')],
    ["backend", original.backend.replace('tableName: "escrow_types"', 'tableName: "escrow_types_broken"')],
    ["factory", original.factory.replaceAll("appendCrudAudit(", "appendMissingAudit(")],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  for (const [, , pageName, clientName] of CATALOGS) {
    const file = `apps/frontend/src/pages/lists/driver/${pageName}.tsx`;
    if (!audit({ ...original, [file]: fs.readFileSync(file, "utf8").replace(`client={${clientName}}`, "client={brokenClient}") }).length) throw new Error(`page mutation survived: ${pageName}`);
  }
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-driver-finance-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + CATALOGS.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-driver-finance-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-driver-finance-catalog-connectivity-exact PASS — 4 company-scoped driver finance catalogs × list/create retain mounted canonical CRUD/reload/audit connectivity");
