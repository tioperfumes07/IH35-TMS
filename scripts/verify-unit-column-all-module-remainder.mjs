#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["unit"],"leafRe":"^master\\.vehicles\\.create$","task":"VERTICAL-UNIT-ALL-MODULES-REMAINDER","vertical":"last-hotfile-slice"} */
import fs from "node:fs";

const FILES = {
  page: "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx",
  api: "apps/frontend/src/api/maintenance.ts",
  route: "apps/backend/src/maintenance/vehicles.routes.ts",
  matrix: "docs/specs/scoreboard/modules/maintenance.required.json",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };
  let matrix;
  try { matrix = JSON.parse(source.matrix); }
  catch { failures.push("maintenance matrix must remain valid JSON"); }
  if (matrix && !matrix.leaves?.find((leaf) => leaf.id === "master.vehicles.create")?.required?.includes("unit")) failures.push("master.vehicles.create must remain an exact unit Required leaf");

  need("page", "createMaintenanceVehicle(input.companyId, {", "creator must forward the submitted company snapshot");
  need("page", "unit_display_id: input.draft.unit_display_id", "creator must submit the snapshotted canonical unit number");
  need("page", 'queryKey: ["maintenance", "master-data", "vehicles", submittedCompanyId]', "creator must reload the submitted scoped roster");
  need("page", 'kind="unit"', "reloaded rows must drill to the canonical unit");
  need("api", "/api/v1/maintenance/vehicles?operating_company_id=${encodeURIComponent(operatingCompanyId)}", "client must send explicit company scope");
  need("route", 'app.post("/api/v1/maintenance/vehicles"', "canonical maintenance unit route must remain mounted");
  need("route", "const row = await withCompany(user.uuid, companyId", "writer must establish company scope");
  need("route", "INSERT INTO mdata.units", "writer must persist to the canonical unit table");
  need("route", "owner_company_id, currently_leased_to_company_id", "writer must persist both canonical company ownership fields");
  need("route", "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$10)", "writer must bind both ownership fields to the selected company");
  need("route", "await ensureUnitAsset(client, {", "unit create must preserve asset linkage");
  need("route", '"maintenance.vehicles.created"', "unit create must remain audited");
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) { console.error(`verify-unit-column-all-module-remainder FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["page", "createMaintenanceVehicle(input.companyId, {"],
    ["page", "unit_display_id: input.draft.unit_display_id"],
    ["page", 'kind="unit"'],
    ["api", "/api/v1/maintenance/vehicles?operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
    ["route", 'app.post("/api/v1/maintenance/vehicles"'],
    ["route", "const row = await withCompany(user.uuid, companyId"],
    ["route", "INSERT INTO mdata.units"],
    ["route", "owner_company_id, currently_leased_to_company_id"],
    ["route", "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$10)"],
    ["route", "await ensureUnitAsset(client, {"],
    ["route", '"maintenance.vehicles.created"'],
    ["matrix", '"id": "master.vehicles.create"'],
  ];
  mutations.forEach(([key, token], index) => {
    if (!source[key].includes(token)) throw new Error(`selftest fixture missing: ${key} ${token}`);
    const mutant = { ...source, [key]: source[key].replaceAll(token, `BROKEN_${index}`) };
    if (!verify(mutant).length) throw new Error(`selftest mutation ${index + 1} survived`);
  });
  console.log(`verify-unit-column-all-module-remainder SELFTEST PASS — ${mutations.length} planted defects rejected`);
}
console.log("verify-unit-column-all-module-remainder PASS — the final unit Required leaf creates, scopes, persists, reloads, and drills canonically");
