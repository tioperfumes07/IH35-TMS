#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_RTD_STATEMACHINE_ROOT ?? process.cwd();
const failures = [];

const migrationPath = path.resolve(ROOT, "db/migrations/0271_safety_rtd_sap.sql");
const sharedPath = path.resolve(ROOT, "apps/backend/src/safety/rtd.shared.ts");
const routesPath = path.resolve(ROOT, "apps/backend/src/safety/rtd.routes.ts");
const indexPath = path.resolve(ROOT, "apps/backend/src/index.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const migration = readIfExists(migrationPath);
if (!migration) failures.push("missing_migration_0271_safety_rtd_sap");
if (!migration.includes("CREATE TABLE IF NOT EXISTS safety.rtd_case")) failures.push("missing_rtd_case_table");
if (!migration.includes("safety.rtd_stage_enum")) failures.push("missing_rtd_stage_enum");
if (!migration.includes("clearinghouse_updated")) failures.push("missing_clearinghouse_updated_column");
if (!migration.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON safety.rtd_case TO ih35_app"))
  failures.push("missing_rtd_case_grants");

const shared = readIfExists(sharedPath);
if (!shared.includes("isLegalRtdAdvance")) failures.push("missing_isLegalRtdAdvance");
if (!shared.includes("isDispatchBlockedByRtd")) failures.push("missing_isDispatchBlockedByRtd");
if (!shared.includes('"complete"')) failures.push("missing_complete_stage");
if (!shared.includes("clearinghouseUpdated")) failures.push("missing_clearinghouse_dispatch_gate");

const routes = readIfExists(routesPath);
if (!routes.includes("/api/v1/safety/rtd/cases")) failures.push("missing_rtd_cases_route");
if (!routes.includes("/api/v1/safety/rtd/drivers/:driver_id/case")) failures.push("missing_driver_rtd_case_route");
if (!routes.includes("/api/v1/safety/rtd/cases/:id/advance")) failures.push("missing_rtd_advance_route");
if (!routes.includes("E_RTD_ILLEGAL_TRANSITION")) failures.push("missing_illegal_transition_guard");
if (!routes.includes("E_RTD_NEGATIVE_TEST_REQUIRED")) failures.push("missing_negative_rtd_test_guard");
if (!routes.includes("E_RTD_CLEARINGHOUSE_REQUIRED")) failures.push("missing_clearinghouse_required_guard");
if (!routes.includes("dispatch_blocked")) failures.push("missing_dispatch_blocked_payload");

const index = readIfExists(indexPath);
if (!index.includes("registerSafetyRtdRoutes")) failures.push("missing_registerSafetyRtdRoutes");

if (failures.length > 0) {
  console.error("verify:rtd-statemachine FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:rtd-statemachine OK");
