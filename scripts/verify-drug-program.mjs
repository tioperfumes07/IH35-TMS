#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_DRUG_PROGRAM_ROOT ?? process.cwd();
const failures = [];

const migrationPath = path.resolve(ROOT, "db/migrations/0270_safety_drug_program.sql");
const dispatchRoutesPath = path.resolve(ROOT, "apps/backend/src/dispatch/loads.routes.ts");
const dispatchBookPath = path.resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
const safetyRoutesPath = path.resolve(ROOT, "apps/backend/src/safety/drug-program.routes.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const migration = readIfExists(migrationPath);
if (!migration) failures.push("missing_migration_0270_safety_drug_program");
if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.drug_test")) failures.push("missing_drug_test_table");
if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.random_pool")) failures.push("missing_random_pool_table");
if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.clearinghouse_query"))
  failures.push("missing_clearinghouse_query_table");
if (!migration.includes("safety.drug_test_result_enum")) failures.push("missing_drug_test_result_enum");
if (!migration.includes("CREATE INDEX IF NOT EXISTS idx_drug_test_company_driver_date"))
  failures.push("missing_drug_test_indexes");
if (!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON safety.drug_test TO ih35_app"))
  failures.push("missing_drug_test_grants");

const safetyRoutes = readIfExists(safetyRoutesPath);
if (!safetyRoutes.includes("/api/v1/safety/drug-program/tests")) failures.push("missing_drug_program_tests_route");
if (!safetyRoutes.includes("/api/v1/safety/drug-program/random-pools")) failures.push("missing_random_pool_route");
if (!safetyRoutes.includes("/api/v1/safety/drug-program/clearinghouse-queries"))
  failures.push("missing_clearinghouse_query_route");

const dispatchRoutes = readIfExists(dispatchRoutesPath);
if (!dispatchRoutes.includes("/api/v1/dispatch/drivers/:driver_id/drug-status"))
  failures.push("missing_dispatch_driver_drug_status_route");

const bookLoad = readIfExists(dispatchBookPath);
if (!bookLoad.includes("E_DRIVER_DRUG_DISPATCH_BLOCKED")) failures.push("missing_dispatch_drug_block_error");
if (!bookLoad.includes("dispatch.book_load_blocked_by_drug_program")) failures.push("missing_dispatch_drug_block_audit");
if (!bookLoad.includes("positive") || !bookLoad.includes("refusal")) failures.push("missing_blocked_drug_results");

if (failures.length > 0) {
  console.error("verify:drug-program FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:drug-program OK");
