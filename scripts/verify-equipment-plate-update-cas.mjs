#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/backend/src/mdata/equipment-plates.routes.ts";

function inspect(source) {
  const update = source.slice(
    source.indexOf('app.patch("/api/v1/mdata/equipment/:id/plates/:plate_id"'),
    source.indexOf('app.post("/api/v1/mdata/equipment/:id/plates/:plate_id/archive"'),
  );
  const checks = [
    ["canonical country boundary", /existingCountry !== "US"[\s\S]*existingCountry !== "MX"/],
    ["country-aware jurisdiction", /validatePlateJurisdiction\(existingCountry, body\.data\.jurisdiction\)/],
    ["company CAS", /UPDATE mdata\.equipment_plates[\s\S]*WHERE id = \$\$\{values\.length - 2\}::uuid[\s\S]*equipment_id = \$\$\{values\.length - 1\}::uuid[\s\S]*operating_company_id = \$\$\{values\.length\}::uuid/],
    ["backlink returned", /RETURNING \*, equipment_id::text/],
    ["identity required", /if \(!updated\?\.id \|\| String\(updated\.equipment_id\) !== params\.data\.id\)/],
    ["audit proven identity", /mdata\.equipment_plates\.updated[\s\S]*resource_id: String\(updated\.id\)[\s\S]*operating_company_id: query\.data\.operating_company_id/],
    ["invalid visible", /outcome\.kind === "invalid_jurisdiction"[\s\S]*code\(400\).*invalid_jurisdiction/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(update)).map(([label]) => label);
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('existingCountry !== "US" &&', "false &&"),
    source.replace("validatePlateJurisdiction(existingCountry, body.data.jurisdiction)", "true"),
    source.replace("AND equipment_id = $${values.length - 1}::uuid", "AND TRUE"),
    source.replace("AND operating_company_id = $${values.length}::uuid", "AND TRUE"),
    source.replace("RETURNING *, equipment_id::text", "RETURNING *"),
    source.replace(/if \(!updated\?\.id \|\| String\(updated\.equipment_id\) !== params\.data\.id\)/, "if (false)"),
    source.replace('"mdata.equipment_plates.updated"', '"planted"'),
  ];
  const survived = mutations.filter((mutant) => inspect(mutant).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-equipment-plate-update-cas --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-equipment-plate-update-cas --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-equipment-plate-update-cas: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-equipment-plate-update-cas — trailer plate update validates jurisdiction and compare-and-sets company/backlink identity");
