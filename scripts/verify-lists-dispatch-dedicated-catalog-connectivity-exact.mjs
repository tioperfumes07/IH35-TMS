#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.dispatch.dispatch_flag_colors.list","catalog.dispatch.dispatch_flag_colors.create","catalog.dispatch.load_types.list","catalog.dispatch.load_types.create","catalog.dispatch.detention_reasons.list","catalog.dispatch.detention_reasons.create","catalog.dispatch.pickup_time_types.list","catalog.dispatch.pickup_time_types.create","catalog.dispatch.additional_charges.list","catalog.dispatch.additional_charges.create","catalog.dispatch.load_cancellation_reasons.list","catalog.dispatch.load_cancellation_reasons.create"],"task":"LISTS-F5958-DISPATCH-DEDICATED-CATALOG-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-dispatch-dedicated-catalog-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const MATRIX = "docs/specs/scoreboard/modules/lists.required.json";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const SHARED_PAGE = "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx";
const SHARED_API = "apps/frontend/src/api/catalogs-dispatch.ts";
const SHARED_BACKEND = "apps/backend/src/catalogs/dispatch/shared.ts";
const SHARED = [
  ["load_types", "load-types", "LoadTypes", "loadTypesCatalogClient"],
  ["detention_reasons", "detention-reasons", "DetentionReasons", "detentionReasonsCatalogClient"],
  ["pickup_time_types", "pickup-time-types", "PickupTimeTypes", "pickupTimeTypesCatalogClient"],
  ["additional_charges", "additional-charges", "AdditionalCharges", "additionalChargesCatalogClient"],
];
const BESPOKE = [
  ["dispatch_flag_colors", "dispatch-flag-colors", "DispatchFlagColorsCatalog", "apps/frontend/src/pages/lists/dispatch/DispatchFlagColorsCatalog.tsx", "apps/backend/src/catalogs/dispatch-flag-colors.routes.ts"],
  ["load_cancellation_reasons", "load-cancellation-reasons", "LoadCancellationReasonsListPage", "apps/frontend/src/pages/lists/dispatch/LoadCancellationReasonsListPage.tsx", "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts"],
];
const read = (file) => fs.readFileSync(file, "utf8");

function matrixProblems(matrix, leafKey, route) {
  const failures = [];
  for (const suffix of ["list", "create"]) {
    const id = `catalog.dispatch.${leafKey}.${suffix}`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== route) failures.push(`${id} route must remain ${route}`);
  }
  return failures;
}

export function audit(s = {}) {
  const failures = [];
  const matrixText = s.matrix ?? read(MATRIX);
  const manifest = s.manifest ?? read(MANIFEST);
  const sharedPage = s.sharedPage ?? read(SHARED_PAGE);
  const sharedApi = s.sharedApi ?? read(SHARED_API);
  const sharedBackend = s.sharedBackend ?? read(SHARED_BACKEND);
  const self = s.self ?? read(SELF);
  let matrix;
  try { matrix = JSON.parse(matrixText); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!self.split("\n").includes(HEADER)) failures.push("exact Built header missing");
  if (!sharedPage.includes("client.list({") || !sharedPage.includes("operating_company_id: companyId") || !sharedPage.includes("client.create(companyId, body)") || !sharedPage.includes("invalidateQueries") || !sharedPage.includes("<CatalogEntryModal")) failures.push("shared Dispatch catalog page must scope list/create, reload, and mount the editor");
  if (!sharedApi.includes("operating_company_id=${encodeURIComponent(operatingCompanyId)}") || !sharedApi.includes('method: "POST"')) failures.push("shared Dispatch API must scope writes by company");
  for (const token of ["withCompanyScope(", 'app.get(basePath', 'app.post(basePath', "operating_company_id = $1::uuid", "INSERT INTO ${tableName}", "appendCrudAudit("]) if (!sharedBackend.includes(token)) failures.push(`shared Dispatch backend missing ${token}`);

  for (const [leafKey, slug, pageName, clientName] of SHARED) {
    const route = `/lists/dispatch/${slug}`;
    failures.push(...matrixProblems(matrix, leafKey, route));
    const pageFile = `apps/frontend/src/pages/lists/dispatch/${pageName}ListPage.tsx`;
    const page = s[pageFile] ?? read(pageFile);
    if (!manifest.includes(`path="${route}"`) || !manifest.includes(`<${pageName}ListPage />`)) failures.push(`${route} must mount ${pageName}ListPage`);
    if (!page.includes(`catalogKey="${slug}"`) || !page.includes(`client={${clientName}}`)) failures.push(`${pageName}ListPage must bind its canonical client`);
    if (!sharedApi.includes(`export const ${clientName} = createDispatchCatalogClient("${slug}")`)) failures.push(`${clientName} must bind ${slug}`);
    const backendFile = `apps/backend/src/catalogs/dispatch/${slug}.routes.ts`;
    const backend = s[backendFile] ?? read(backendFile);
    if (!backend.includes(`catalogPath: "${slug}"`) || !backend.includes(`tableName: "${leafKey}"`) || !backend.includes("registerDispatchCatalogCrudRoutes")) failures.push(`${slug} must register canonical scoped CRUD`);
  }

  for (const [leafKey, slug, pageName, pageFile, backendFile] of BESPOKE) {
    const route = `/lists/dispatch/${slug}`;
    failures.push(...matrixProblems(matrix, leafKey, route));
    const page = s[pageFile] ?? read(pageFile);
    const backend = s[backendFile] ?? read(backendFile);
    if (!manifest.includes(`path="${route}"`) || !manifest.includes(`<${pageName} />`)) failures.push(`${route} must mount ${pageName}`);
    if (!page.includes("selectedCompanyId") || !page.includes("companyId") || !page.includes("invalidateQueries") || !page.includes("operating_company_id: companyId")) failures.push(`${pageName} must scope read/create and reload`);
    const apiPath = slug === "dispatch-flag-colors" ? "/api/v1/catalogs/dispatch-flag-colors" : "/api/v1/catalogs/load-cancellation-reasons";
    if (!backend.includes(`app.get("${apiPath}"`) || !backend.includes(`app.post("${apiPath}"`) || !backend.includes("operating_company_id") || !backend.includes("INSERT INTO catalogs.") || !backend.includes("appendCrudAudit(")) failures.push(`${slug} backend must retain scoped GET/POST/INSERT/audit`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = { matrix: read(MATRIX), manifest: read(MANIFEST), sharedPage: read(SHARED_PAGE), sharedApi: read(SHARED_API), sharedBackend: read(SHARED_BACKEND), self: read(SELF) };
  const mutations = [
    ["matrix", original.matrix.replace('"id": "catalog.dispatch.load_types.list"', '"id": "catalog.dispatch.load_types.list.broken"')],
    ["manifest", original.manifest.replace('path="/lists/dispatch/load-types"', 'path="/lists/dispatch/load-types-broken"')],
    ["sharedPage", original.sharedPage.replace("client.create(companyId, body)", 'client.create("", body)')],
    ["sharedApi", original.sharedApi.replace('createDispatchCatalogClient("detention-reasons")', 'createDispatchCatalogClient("detention-reasons-broken")')],
    ["sharedBackend", original.sharedBackend.replaceAll("appendCrudAudit(", "appendMissingAudit(")],
  ];
  for (const [key, mutant] of mutations) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  for (const [leafKey, slug, pageName, clientName] of SHARED) {
    const file = `apps/frontend/src/pages/lists/dispatch/${pageName}ListPage.tsx`;
    if (!audit({ ...original, [file]: read(file).replace(`client={${clientName}}`, "client={brokenClient}") }).length) throw new Error(`page mutation survived: ${slug}`);
  }
  for (const [, slug, , pageFile, backendFile] of BESPOKE) {
    if (!audit({ ...original, [pageFile]: read(pageFile).replace("operating_company_id: companyId", 'operating_company_id: ""') }).length) throw new Error(`page mutation survived: ${slug}`);
    if (!audit({ ...original, [backendFile]: read(backendFile).replaceAll("appendCrudAudit(", "appendMissingAudit(") }).length) throw new Error(`backend mutation survived: ${slug}`);
  }
  if (!audit({ ...original, self: original.self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-dispatch-dedicated-catalog-connectivity-exact SELFTEST PASS — ${mutations.length + SHARED.length + BESPOKE.length * 2 + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-dispatch-dedicated-catalog-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-dispatch-dedicated-catalog-connectivity-exact PASS — 6 Dispatch catalogs × list/create retain mounted, scoped, canonical CRUD/reload/audit connectivity");
