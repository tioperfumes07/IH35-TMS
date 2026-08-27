#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/backend/src/mdata/equipment-plates.routes.ts";
function inspect(source) {
  const archive = source.slice(source.indexOf('app.post("/api/v1/mdata/equipment/:id/plates/:plate_id/archive"'));
  const checks = [
    ["scoped archive CAS", /WHERE id = \$1::uuid AND equipment_id = \$2::uuid AND operating_company_id = \$3::uuid AND status <> 'archived'/],
    ["identity required", /if \(!archivedPlate\?\.id\) return null/],
    ["archive audit", /mdata\.equipment_plates\.archived/],
    ["audit links", /resource_id: String\(archivedPlate\.id\)[\s\S]*equipment_id: params\.data\.id[\s\S]*operating_company_id: query\.data\.operating_company_id/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(archive)).map(([label]) => label);
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(
      "WHERE id = $1::uuid AND equipment_id = $2::uuid AND operating_company_id = $3::uuid AND status <> 'archived'",
      "WHERE id = $1::uuid AND equipment_id = $2::uuid AND TRUE AND status <> 'archived'",
    ),
    source.replace(/if \(!archivedPlate\?\.id\) return null;/, "// planted"),
    source.replace('"mdata.equipment_plates.archived"', '"planted"'),
    source.replace("resource_id: String(archivedPlate.id)", "resource_id: undefined"),
  ];
  const survived = mutations.filter((mutant) => inspect(mutant).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-equipment-plate-archive-audit --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-equipment-plate-archive-audit --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}
const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-equipment-plate-archive-audit: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-equipment-plate-archive-audit — scoped trailer plate archive requires identity and appends company audit");
