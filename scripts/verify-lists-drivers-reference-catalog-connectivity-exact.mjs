#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.drivers.license_classes.list","catalog.drivers.license_classes.create","catalog.drivers.endorsements.list","catalog.drivers.endorsements.create","catalog.drivers.restrictions.list","catalog.drivers.restrictions.create","catalog.drivers.medical_card_status.list","catalog.drivers.medical_card_status.create","catalog.drivers.employment_status.list","catalog.drivers.employment_status.create"],"task":"LISTS-F5960-DRIVERS-REFERENCE-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const SELF = "scripts/verify-lists-drivers-reference-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  page: "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx",
  modal: "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogModal.tsx",
  api: "apps/frontend/src/api/lists-drivers-catalogs.ts",
  routes: "apps/backend/src/lists/drivers-reference.routes.ts",
  shared: "apps/backend/src/lists/drivers-reference.shared.ts",
};
const CATALOGS = [
  ["license_classes", "license-classes", "licenseClassesCatalogClient"],
  ["endorsements", "endorsements", "cdlEndorsementsCatalogClient"],
  ["restrictions", "restrictions", "cdlRestrictionsCatalogClient"],
  ["medical_card_status", "medical-card-status", "medicalCardStatusCatalogClient"],
  ["employment_status", "employment-status", "employmentStatusCatalogClient"],
];
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  if (!src.page.includes("client.list({") || !src.page.includes("client.archive(row.id)") || !src.page.includes("client.restore(row.id)") || !src.page.includes("void query.refetch();") || !src.page.includes("<DriversReferenceCatalogModal")) failures.push("reference catalog page must list/archive/restore/reload and mount create");
  if (!src.modal.includes("await client.create({") || !src.modal.includes("onSaved();") || !src.modal.includes("+ Create")) failures.push("reference catalog modal must create canonically then reload");
  for (const token of ["app.get(basePath", "app.post(basePath", "INSERT INTO reference.${config.tableName}", "appendCrudAudit(", '/:id/archive', '/:id/restore']) if (!src.routes.includes(token)) failures.push(`reference backend missing ${token}`);

  for (const [leafKey, slug, clientName] of CATALOGS) {
    const route = `/lists/drivers/${slug}`;
    for (const suffix of ["list", "create"]) {
      const id = `catalog.drivers.${leafKey}.${suffix}`;
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
    }
    if (!src.manifest.includes(`path="${route}"`)) failures.push(`${route} must remain mounted`);
    const configStart = src.shared.indexOf(`urlSegment: "${slug}"`);
    if (configStart < 0) failures.push(`${slug} backend config missing`);
    if (!src.api.includes(`export const ${clientName}`) || !src.api.includes(`createDriversReferenceCatalogClient("${slug}")`)) failures.push(`${clientName} must bind ${slug}`);
    const pageFile = `apps/frontend/src/pages/lists/drivers/${slug}/Catalog.tsx`;
    const leafPage = s[pageFile] ?? fs.readFileSync(pageFile, "utf8");
    if (!leafPage.includes("DriversReferenceCatalogPage") || !leafPage.includes(`client={${clientName}}`) || !leafPage.includes(`catalogKey="${slug}"`)) failures.push(`${slug} page must bind the canonical shared surface`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.drivers.license_classes.list"', '"id": "catalog.drivers.license_classes.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/drivers/license-classes"', 'path="/lists/drivers/license-classes-broken"')],
    ["page", original.page.replace("client.archive(row.id)", "client.archive(\"\")")],
    ["modal", original.modal.replace("await client.create({", "await missingCreate({")],
    ["api", original.api.replace('createDriversReferenceCatalogClient("endorsements")', 'createDriversReferenceCatalogClient("endorsements-broken")')],
    ["routes", original.routes.replaceAll("appendCrudAudit(", "appendMissingAudit(")],
    ["shared", original.shared.replace('urlSegment: "restrictions"', 'urlSegment: "restrictions-broken"')],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  for (const [, slug, clientName] of CATALOGS) {
    const file = `apps/frontend/src/pages/lists/drivers/${slug}/Catalog.tsx`;
    if (!audit({ ...original, [file]: fs.readFileSync(file, "utf8").replace(`client={${clientName}}`, "client={brokenClient}") }).length) throw new Error(`leaf page mutation survived: ${slug}`);
  }
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-drivers-reference-catalog-connectivity-exact SELFTEST PASS — ${mutants.length + CATALOGS.length + 1} planted defects rejected`);
  process.exit(0);
}

execFileSync(process.execPath, ["scripts/verify-drivers-reference-catalogs-wired.mjs"], { stdio: "inherit" });
const failures = audit();
if (failures.length) { console.error(`verify-lists-drivers-reference-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-drivers-reference-catalog-connectivity-exact PASS — 5 global driver reference catalogs × list/create retain mounted canonical CRUD/reload/audit connectivity");
