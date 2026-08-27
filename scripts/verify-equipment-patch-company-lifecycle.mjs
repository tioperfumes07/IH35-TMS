#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const FILE = "apps/backend/src/mdata/equipment.routes.ts";
function mutatePatch(source, from, to) {
  const start = source.indexOf('app.patch("/api/v1/mdata/equipment/:id"');
  return source.slice(0, start) + source.slice(start).replace(from, to);
}
function inspect(source) {
  const patch = source.slice(source.indexOf('app.patch("/api/v1/mdata/equipment/:id"'), source.indexOf('app.post("/api/v1/mdata/equipment/:id/deactivate"'));
  const checks = [
    ["lifecycle boundary", /"status" in b \|\| "deactivated_at" in b[\s\S]*use_equipment_lifecycle_endpoint/],
    ["scope GUC", /setScopedCompanyContext\(client, authUser\.uuid, scopedCompanyId\)/],
    ["scope required", /if \(!scopedCompanyId\) return null[\s\S]*setScopedCompanyContext\(client, authUser\.uuid, scopedCompanyId\)/],
    ["owner authorized", /resolveOperatingCompanyId\(client, authUser\.uuid, b\.owner_company_id\)/],
    ["owner required", /if \(!resolvedOwnerId\) throw new Error\("owner_company_id_required"\)/],
    ["lease authorized", /resolveOperatingCompanyId\(client, authUser\.uuid, b\.currently_leased_to_company_id\)/],
    ["unit lock scope", /FROM mdata\.units[\s\S]*owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid[\s\S]*FOR SHARE/],
    ["location lock scope", /FROM mdata\.locations[\s\S]*operating_company_id = \$2::uuid[\s\S]*FOR SHARE/],
    ["write scope CAS", /WHERE id = \$\$\{idIdx\}[\s\S]*owner_company_id = \$\$\{scopeIdx\} OR currently_leased_to_company_id = \$\$\{scopeIdx\}/],
    ["lost race visible", /return \{ kind: "conflict" as const \}[\s\S]*mdata_equipment_state_changed/],
    ["audit target companies", /owner_company_id: resolvedOwnerId[\s\S]*currently_leased_to_company_id: resolvedLeasedId[\s\S]*operating_company_id: targetCompanyId/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(patch)).map(([label]) => label);
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('"status" in b || "deactivated_at" in b', "false"),
    mutatePatch(source, "await setScopedCompanyContext(client, authUser.uuid, scopedCompanyId);", "// planted"),
    mutatePatch(source, "if (!scopedCompanyId) return null;", "// planted"),
    source.replace("resolveOperatingCompanyId(client, authUser.uuid, b.owner_company_id)", "b.owner_company_id"),
    source.replace(/if \(!resolvedOwnerId\) throw new Error\("owner_company_id_required"\);/, "// planted"),
    source.replace("resolveOperatingCompanyId(client, authUser.uuid, b.currently_leased_to_company_id)", "b.currently_leased_to_company_id"),
    source.replace(/(`SELECT id FROM mdata\.units[\s\S]*?)owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid/, "$1TRUE"),
    source.replace("operating_company_id = $2::uuid", "TRUE"),
    source.replace("owner_company_id = $${scopeIdx} OR currently_leased_to_company_id = $${scopeIdx}", "TRUE"),
    mutatePatch(source, 'return { kind: "conflict" as const };', "return null;"),
    source.replace("operating_company_id: targetCompanyId", "operating_company_id: undefined"),
  ];
  const survived = mutations
    .map((mutant, index) => ({ mutant, index }))
    .filter(({ mutant }) => inspect(mutant).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-equipment-patch-company-lifecycle --selftest: ${survived.length}/${mutations.length} survived (${survived.map(({ index }) => index + 1).join(",")})`);
    process.exit(1);
  }
  console.log(`PASS verify-equipment-patch-company-lifecycle --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}
const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-equipment-patch-company-lifecycle: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-equipment-patch-company-lifecycle — equipment PATCH authorizes resulting scope/FKs and cannot bypass lifecycle transitions");
