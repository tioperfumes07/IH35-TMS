#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/backend/src/mdata/equipment.routes.ts";
function inspect(source) {
  const create = source.slice(source.indexOf('app.post(\n    "/api/v1/mdata/equipment"'), source.indexOf('app.get("/api/v1/mdata/equipment/:id"'));
  const helper = source.slice(source.indexOf("async function resolveAssetCompanyIds"), source.indexOf("export async function registerEquipmentRoutes"));
  const checks = [
    ["owner membership", helper, /resolveOperatingCompanyId\(client, userId, ownerCompanyId\)/],
    ["lease membership", helper, /resolveOperatingCompanyId\(client, userId, leasedCompanyId\)/],
    ["write rate limit", create, /rateLimit: \{ max: 30, timeWindow: "1 minute" \}/],
    ["scope set", create, /effectiveCompanyId = resolvedLeasedId \?\? resolvedOwnerId[\s\S]*setScopedCompanyContext\(client, authUser\.uuid, effectiveCompanyId\)/],
    ["unit company FK", create, /FROM mdata\.units AS linked_unit[\s\S]*linked_unit\.owner_company_id = \$14::uuid[\s\S]*linked_unit\.currently_leased_to_company_id = \$14::uuid/],
    ["location company FK", create, /FROM mdata\.locations AS linked_location[\s\S]*linked_location\.operating_company_id = \$14::uuid/],
    ["identity required", create, /if \(!row\?\.id\) throw new Error\("invalid_equipment_fk_reference"\)/],
    ["audit company spine", create, /owner_company_id: resolvedOwnerId[\s\S]*currently_leased_to_company_id: resolvedLeasedId[\s\S]*operating_company_id: effectiveCompanyId/],
    ["visible invalid FK", create, /message === "invalid_equipment_fk_reference"[\s\S]*code\(400\)/],
  ];
  return checks.filter(([, text, pattern]) => !pattern.test(text)).map(([label]) => label);
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("resolveOperatingCompanyId(client, userId, ownerCompanyId)", "ownerCompanyId"),
    source.replace("resolveOperatingCompanyId(client, userId, leasedCompanyId)", "leasedCompanyId"),
    source.replace('{ config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },', "{}"),
    source.replace("await setScopedCompanyContext(client, authUser.uuid, effectiveCompanyId);", "// planted"),
    source.replace("linked_unit.owner_company_id = $14::uuid", "TRUE"),
    source.replace("linked_location.operating_company_id = $14::uuid", "TRUE"),
    source.replace(/if \(!row\?\.id\) throw new Error\("invalid_equipment_fk_reference"\);/, "// planted"),
    source.replace("operating_company_id: effectiveCompanyId", "operating_company_id: undefined"),
    source.replace('message === "invalid_equipment_fk_reference"', 'message === "planted"'),
  ];
  const survived = mutations.filter((mutant) => inspect(mutant).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-equipment-create-company-fk-identity --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-equipment-create-company-fk-identity --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}
const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-equipment-create-company-fk-identity: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-equipment-create-company-fk-identity — authorized owner/lease and scoped unit/location FKs produce one proven equipment identity");
