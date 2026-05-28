#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_INSURANCE_SCHEMA_ROOT ?? process.cwd();
const failures = [];

const migrationPath = path.resolve(ROOT, "db/migrations/0274_insurance.sql");
const sharedPath = path.resolve(ROOT, "apps/backend/src/insurance/policy.shared.ts");
const routesPath = path.resolve(ROOT, "apps/backend/src/insurance/policy.routes.ts");
const indexPath = path.resolve(ROOT, "apps/backend/src/index.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const migration = readIfExists(migrationPath);
if (!migration) failures.push("missing_migration_0274_insurance");
if (!migration.includes("CREATE SCHEMA IF NOT EXISTS insurance")) failures.push("missing_insurance_schema");
if (!migration.includes("CREATE TABLE IF NOT EXISTS insurance.policy")) failures.push("missing_insurance_policy_table");
if (!migration.includes("CREATE TABLE IF NOT EXISTS insurance.policy_unit")) failures.push("missing_insurance_policy_unit_table");
for (const coverageType of [
  "auto_liability",
  "physical_damage",
  "cargo",
  "general_liability",
  "workers_comp",
]) {
  if (!migration.includes(`'${coverageType}'`)) failures.push(`missing_coverage_type_${coverageType}`);
}
if (!migration.includes("REFERENCES mdata.assets(id)")) failures.push("missing_policy_unit_asset_fk");
if (!migration.includes("insured_value_cents BIGINT NOT NULL DEFAULT 0 CHECK (insured_value_cents >= 0)"))
  failures.push("missing_non_negative_insured_value_guard");
if (!migration.includes("idx_insurance_policy_tenant_coverage")) failures.push("missing_policy_coverage_index");
if (!migration.includes("idx_insurance_policy_unit_asset")) failures.push("missing_policy_unit_asset_index");
if (!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy TO ih35_app"))
  failures.push("missing_insurance_policy_grants");
if (!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.policy_unit TO ih35_app"))
  failures.push("missing_insurance_policy_unit_grants");

const shared = readIfExists(sharedPath);
if (!shared.includes("INSURANCE_COVERAGE_TYPES")) failures.push("missing_INSURANCE_COVERAGE_TYPES_constant");

const routes = readIfExists(routesPath);
if (!routes.includes("/api/v1/insurance/policies")) failures.push("missing_insurance_policies_routes");
if (!routes.includes('app.get("/api/v1/insurance/policies"')) failures.push("missing_insurance_policies_list_route");
if (!routes.includes('app.post("/api/v1/insurance/policies"')) failures.push("missing_insurance_policies_create_route");
if (!routes.includes('app.patch("/api/v1/insurance/policies/:id"')) failures.push("missing_insurance_policies_patch_route");
if (!routes.includes('app.delete("/api/v1/insurance/policies/:id"')) failures.push("missing_insurance_policies_delete_route");
if (!routes.includes('app.post("/api/v1/insurance/policies/:policy_id/units"'))
  failures.push("missing_insurance_policy_unit_create_route");
if (!routes.includes('app.get("/api/v1/assets/:id/coverage"')) failures.push("missing_asset_coverage_route");
if (!routes.includes("FROM mdata.assets")) failures.push("missing_asset_reference_validation");
if (!routes.includes("gap_types")) failures.push("missing_coverage_gap_types_payload");

const index = readIfExists(indexPath);
if (!index.includes("registerInsurancePolicyRoutes")) failures.push("missing_registerInsurancePolicyRoutes");

if (failures.length > 0) {
  console.error("verify:insurance-schema FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:insurance-schema OK");
