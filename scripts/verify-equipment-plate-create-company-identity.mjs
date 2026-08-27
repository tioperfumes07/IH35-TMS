#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/backend/src/mdata/equipment-plates.routes.ts";

function inspect(source) {
  const create = source.slice(
    source.indexOf('app.post("/api/v1/mdata/equipment/:id/plates"'),
    source.indexOf('app.patch("/api/v1/mdata/equipment/:id/plates/:plate_id"'),
  );
  const checks = [
    ["atomic company parent", /INSERT INTO mdata\.equipment_plates[\s\S]*FROM mdata\.equipment AS equipment[\s\S]*equipment\.owner_company_id = \$1::uuid[\s\S]*equipment\.currently_leased_to_company_id = \$1::uuid/],
    ["canonical child backlink", /RETURNING id::text, equipment_id::text/],
    ["identity required", /if \(!created\?\.id \|\| created\.equipment_id !== params\.data\.id\) return null/],
    ["audit uses proven identity", /resource_id: created\.id[\s\S]*equipment_id: params\.data\.id[\s\S]*operating_company_id: query\.data\.operating_company_id/],
    ["response uses proven row", /return created;/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(create)).map(([label]) => label);
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("equipment.owner_company_id = $1::uuid", "TRUE"),
    source.replace("equipment.currently_leased_to_company_id = $1::uuid", "TRUE"),
    source.replace("equipment_id::text", "NULL::text AS equipment_id"),
    source.replace(/if \(!created\?\.id \|\| created\.equipment_id !== params\.data\.id\) return null;/, "// planted"),
    source.replace("resource_id: created.id", "resource_id: undefined"),
  ];
  const survived = mutations.filter((mutant) => inspect(mutant).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-equipment-plate-create-company-identity --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-equipment-plate-create-company-identity --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-equipment-plate-create-company-identity: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-equipment-plate-create-company-identity — trailer plate create binds company-owned/leased parent and proven child identity");
