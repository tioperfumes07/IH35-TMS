#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_RLS_ROOT ?? process.cwd();
const migrationPaths = [
  "db/migrations/0246_safety_driver_profile.sql",
  "db/migrations/0247_safety_dq_file.sql",
  "db/migrations/0248_safety_medical_cards.sql",
  "db/migrations/0249_safety_background_checks.sql",
  "db/migrations/0250_safety_training_records.sql",
].map((file) => path.resolve(ROOT, file));

const routePaths = [
  "apps/backend/src/safety/driver-profile.routes.ts",
  "apps/backend/src/safety/driver-qualification.routes.ts",
  "apps/backend/src/safety/medical-cards.routes.ts",
  "apps/backend/src/safety/background-checks.routes.ts",
  "apps/backend/src/safety/training-records.routes.ts",
  "apps/backend/src/safety/driver-documents.routes.ts",
].map((file) => path.resolve(ROOT, file));

const requiredTables = [
  "safety.driver_safety_profiles",
  "safety.driver_qualification_files",
  "safety.medical_cards",
  "safety.background_checks",
  "safety.training_records",
  "safety.driver_documents",
];

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const migrationSource = migrationPaths.map((file) => read(file)).join("\n");
  const routeSource = routePaths.map((file) => read(file)).join("\n");
  const failures = [];

  for (const tableName of requiredTables) {
    const tableSuffix = tableName.split(".")[1];
    if (!new RegExp(`ALTER TABLE\\s+${tableName.replace(".", "\\.")}\\s+ENABLE ROW LEVEL SECURITY`, "m").test(migrationSource)) {
      failures.push(`missing_rls_enable:${tableName}`);
    }
    if (!new RegExp(`CREATE POLICY\\s+${tableSuffix}_[a-z_]*tenant_scope`, "m").test(migrationSource)) {
      failures.push(`missing_tenant_policy:${tableName}`);
    }
    if (!new RegExp(`${tableName.replace(".", "\\.")}`).test(migrationSource)) {
      failures.push(`missing_table:${tableName}`);
    }
  }

  const companyScopeCount = (routeSource.match(/withCompanyScope\s*\(/g) ?? []).length;
  if (companyScopeCount < routePaths.length) {
    failures.push("route_scope_missing:withCompanyScope");
  }

  if (failures.length > 0) {
    console.error("verify:safety-rls-coverage FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-rls-coverage OK");
}

main();
