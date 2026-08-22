#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["connectivity"],"leaves":["catalog.fleet.tire_positions.list","catalog.fleet.tire_positions.create"],"task":"LISTS-F5969-FLEET-TIRE-POSITIONS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const SELF = "scripts/verify-lists-fleet-tire-positions-connectivity-exact.mjs";
const HEADER = fs.readFileSync(SELF, "utf8").split("\n")[1];
const FILES = {
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  hub: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  page: "apps/frontend/src/pages/lists/fleet/TirePositionsListPage.tsx",
  list: "apps/frontend/src/pages/lists/fleet/FleetCatalogListPage.tsx",
  modal: "apps/frontend/src/pages/lists/fleet/FleetCatalogModal.tsx",
  client: "apps/frontend/src/api/catalogs-fleet.ts",
  route: "apps/backend/src/catalogs/fleet/tire-positions.routes.ts",
  factory: "apps/backend/src/catalogs/fleet/factory.ts",
  migration: "db/migrations/0068_p3_t11_21_8a_fleet_catalogs.sql",
};
const read = (key) => fs.readFileSync(FILES[key], "utf8");

export function audit(s = {}) {
  const failures = [];
  const src = Object.fromEntries(Object.keys(FILES).map((key) => [key, s[key] ?? read(key)]));
  let matrix;
  try { matrix = JSON.parse(src.matrix); } catch (error) { return [`Lists matrix invalid: ${error.message}`]; }
  if (!(s.self ?? fs.readFileSync(SELF, "utf8")).split("\n").includes(HEADER)) failures.push("exact Built header missing");
  for (const suffix of ["list", "create"]) {
    const id = `catalog.fleet.tire_positions.${suffix}`;
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== "/lists/fleet/tire-positions") failures.push(`${id} route drifted`);
  }
  if (!src.manifest.includes('path="/lists/fleet/tire-positions"') || !src.manifest.includes("<TirePositionsListPage />")) failures.push("Tire Positions page route missing");
  if (!src.hub.includes('name: "Tire Positions"') || !src.hub.includes('catalogKey: "tire-positions"')) failures.push("Fleet hub tile missing");
  if (!src.page.includes("tirePositionsCatalogClient") || /readOnly/.test(src.page)) failures.push("Tire Positions page must expose governed creator/editor");
  if (!src.list.includes("useCreateQueryParam") || !src.list.includes("+ Create") || !src.list.includes("void query.refetch()")) failures.push("shared page must open creator and reload");
  if (!src.modal.includes("client.create(operatingCompanyId, body)") || !src.modal.includes("client.update(row.id, operatingCompanyId, body)") || !src.modal.includes("client.deactivate(row.id, operatingCompanyId)")) failures.push("shared modal must execute canonical CRUD client");
  if (!src.client.includes('createFleetCatalogClient("tire-positions")') || !src.client.includes('method: "POST"') || !src.client.includes('method: "PATCH"') || !src.client.includes('method: "DELETE"')) failures.push("Tire Positions canonical client CRUD missing");
  if (!src.route.includes('tableName: "tire_positions"') || !src.route.includes('urlSegment: "tire-positions"') || !src.route.includes("companyScoped: false") || !src.route.includes("listLimitMax: 500")) failures.push("global Tire Positions route config missing");
  for (const token of ["isCatalogWriteRole", "appendCrudAudit", "SET is_active = false", "deactivated_at = now()", "created_by_user_id", "updated_by_user_id"]) if (!src.factory.includes(token)) failures.push(`governed factory missing ${token}`);
  if (!/SELECT catalogs\.__seed_fleet_catalog\(\s*'tire_positions'/.test(src.migration) || !src.migration.includes("ALTER TABLE catalogs.%I FORCE ROW LEVEL SECURITY")) failures.push("canonical seeded/RLS table migration missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const original = Object.fromEntries(Object.keys(FILES).map((key) => [key, read(key)]));
  const mutants = [
    ["matrix", original.matrix.replace('"id": "catalog.fleet.tire_positions.create"', '"id": "catalog.fleet.tire_positions.create.broken"')],
    ["manifest", original.manifest.replace('path="/lists/fleet/tire-positions"', 'path="/lists/fleet/tire-positions-broken"')],
    ["hub", original.hub.replace('name: "Tire Positions"', 'name: "Tire Positions Broken"')],
    ["page", original.page.replace("breadcrumbPath=", "readOnly breadcrumbPath=")],
    ["list", original.list.replace("+ Create", "+ Broken")],
    ["modal", original.modal.replace("client.create(operatingCompanyId, body)", "Promise.resolve(body)")],
    ["client", original.client.replace('createFleetCatalogClient("tire-positions")', 'createFleetCatalogClient("tire-positions-broken")')],
    ["route", original.route.replace("listLimitMax: 500", "listLimitMax: 200")],
    ["factory", original.factory.replaceAll("appendCrudAudit", "appendAuditBroken")],
    ["migration", original.migration.replace("SELECT catalogs.__seed_fleet_catalog(\n  'tire_positions'", "SELECT catalogs.__seed_fleet_catalog(\n  'tire_positions_broken'")],
  ];
  for (const [key, mutant] of mutants) if (!audit({ ...original, [key]: mutant }).length) throw new Error(`mutation survived: ${key}`);
  const self = fs.readFileSync(SELF, "utf8");
  if (!audit({ ...original, self: self.replace(HEADER, `${HEADER}.broken`) }).length) throw new Error("header mutation survived");
  console.log(`verify-lists-fleet-tire-positions-connectivity-exact SELFTEST PASS — ${mutants.length + 1} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) { console.error(`verify-lists-fleet-tire-positions-connectivity-exact FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-lists-fleet-tire-positions-connectivity-exact PASS — list/create use canonical global taxonomy CRUD, audit, reload, and void-not-delete");
