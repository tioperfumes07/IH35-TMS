#!/usr/bin/env node
import fs from "node:fs";

const files = {
  parts: fs.readFileSync("apps/backend/src/maintenance/parts.routes.ts", "utf8"),
  vendors: fs.readFileSync("apps/backend/src/maintenance/vendors.routes.ts", "utf8"),
  vehicles: fs.readFileSync("apps/backend/src/maintenance/vehicles.routes.ts", "utf8"),
  tires: fs.readFileSync("apps/backend/src/maintenance/tires.routes.ts", "utf8"),
};
const checks = [
  ["parts", /const createdPart = result\.rows\[0\];\s*if \(!createdPart\?\.id\) throw new Error\("maintenance_part_insert_returned_no_row"\)/, "part identity"],
  ["parts", /resource_id: createdPart\.id[\s\S]*?return createdPart/, "part audit/response identity"],
  ["vendors", /const createdVendor = res\.rows\[0\];\s*if \(!createdVendor\?\.id\) throw new Error\("maintenance_vendor_insert_returned_no_row"\)/, "vendor identity"],
  ["vendors", /resource_id: createdVendor\.id[\s\S]*?return mapVendorRow\(createdVendor\)/, "vendor audit/response identity"],
  ["vehicles", /const created = inserted\.rows\[0\];\s*if \(!created\?\.id\) throw new Error\("maintenance_vehicle_insert_returned_no_row"\)/, "vehicle identity"],
  ["vehicles", /ensureUnitAsset\(client, \{[\s\S]*?unitId: String\(created\.id\)[\s\S]*?resource_id: created\.id/, "vehicle asset/audit identity"],
  ["tires", /const createdBrand = res\.rows\[0\];\s*if \(!createdBrand\?\.id\) throw new Error\("tire_brand_insert_returned_no_row"\)/, "tire brand identity"],
  ["tires", /return createdBrand;/, "tire brand response identity"],
  ["tires", /if \(!tireRecordId\) throw new Error\("tire_record_insert_returned_no_row"\)/, "tire record identity"],
  ["tires", /if \(!created\) throw new Error\("tire_record_reload_returned_no_row"\)/, "tire record reload"],
  ["tires", /reply\.code\(201\)\.send\(mapTireRecordRow\(row\)\)/, "tire response cannot fabricate row"],
];
const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const missing = failures(files);
if (missing.length) {
  console.error(`FAIL verify-maintenance-master-create-identities: ${missing.join("; ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-maintenance-master-create-identities --selftest (${checks.length} mutations killed)`);
  process.exit(0);
}
console.log("PASS verify-maintenance-master-create-identities");
