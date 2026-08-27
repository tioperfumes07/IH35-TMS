#!/usr/bin/env node
import fs from "node:fs";

const routePath = "apps/backend/src/fuel/fuel-transactions.routes.ts";
const original = fs.readFileSync(routePath, "utf8");

function verify(source) {
  const failures = [];
  const checks = [
    ["manual fuel create validates the driver is active", /FROM mdata\.drivers d[\s\S]*?d\.id = \$1::uuid[\s\S]*?d\.deactivated_at IS NULL[\s\S]*?driver_company_authorizations fuel_create_driver_dca/],
    ["manual fuel create validates the unit is active", /FROM mdata\.units fuel_create_unit[\s\S]*?fuel_create_unit\.id = \$1::uuid[\s\S]*?fuel_create_unit\.deactivated_at IS NULL[\s\S]*?COALESCE\(fuel_create_unit\.currently_leased_to_company_id, fuel_create_unit\.owner_company_id\) = \$2::uuid/],
    ["manual fuel create validates the trailer is active", /FROM mdata\.equipment[\s\S]*?id = \$1::uuid[\s\S]*?deactivated_at IS NULL[\s\S]*?owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid/],
    ["invalid drivers fail closed", /driver_not_found_for_company/],
    ["invalid units fail closed", /unit_not_found_for_company/],
    ["invalid trailers fail closed", /trailer_not_found_for_company/],
  ];
  for (const [message, pattern] of checks) if (!pattern.test(source)) failures.push(message);
  return failures;
}

const failures = verify(original);
if (failures.length) {
  console.error(`FAIL verify-fuel-manual-create-active-linkages: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["d.deactivated_at IS NULL", "d.deactivated_at IS NOT NULL"],
    ["fuel_create_unit.deactivated_at IS NULL", "fuel_create_unit.deactivated_at IS NOT NULL"],
    ["AND deactivated_at IS NULL\n              AND (owner_company_id", "AND deactivated_at IS NOT NULL\n              AND (owner_company_id"],
    ["driver_not_found_for_company", "driver_linkage_error_removed"],
    ["unit_not_found_for_company", "unit_linkage_error_removed"],
    ["trailer_not_found_for_company", "trailer_linkage_error_removed"],
  ];
  for (const [from, to] of mutations) {
    if (!original.includes(from)) {
      console.error(`FAIL selftest fixture missing: ${from}`);
      process.exit(1);
    }
    if (verify(original.replace(from, to)).length === 0) {
      console.error(`FAIL selftest mutation survived: ${from}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-fuel-manual-create-active-linkages --selftest (${mutations.length} mutations killed)`);
  process.exit(0);
}

console.log("PASS verify-fuel-manual-create-active-linkages");
