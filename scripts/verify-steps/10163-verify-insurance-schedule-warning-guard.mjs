// 10163-verify-insurance-schedule-warning-guard.mjs
// Guard: verifies that the insurance schedule warning guard is properly wired.
// Checks:
//   1. Migration file exists with the correct timestamp
//   2. The pre-dispatch validator has checkDriverInsuranceSchedule
//   3. The schedule-confirmations route file exists
//   4. The route is registered in index.ts
//   5. The frontend PreDispatchValidationPanel logs confirmations for INS-SCHEDULE-NOT-ON-POLICY

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let errors = [];

// 1. Migration file exists
const migrationFile = join(repoRoot, "db/migrations/202613311200_insurance_driver_schedule_and_confirmations.sql");
if (!existsSync(migrationFile)) {
  errors.push("MISSING: db/migrations/202613311200_insurance_driver_schedule_and_confirmations.sql");
} else {
  const sql = readFileSync(migrationFile, "utf8");
  if (!sql.includes("insurance.driver_schedule")) errors.push("Migration missing insurance.driver_schedule table");
  if (!sql.includes("insurance.schedule_confirmations")) errors.push("Migration missing insurance.schedule_confirmations table");
  if (!sql.includes("FORCE ROW LEVEL SECURITY")) errors.push("Migration missing FORCE RLS");
  if (!sql.includes("INSURANCE_SCHEDULE_WARNING_ENABLED")) errors.push("Migration missing feature flag");
  if (!sql.includes("GRANT SELECT, INSERT ON insurance.schedule_confirmations")) errors.push("Migration missing append-only grant for confirmations");
}

// 2. Pre-dispatch validator has checkDriverInsuranceSchedule
const validatorFile = join(repoRoot, "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts");
if (!existsSync(validatorFile)) {
  errors.push("MISSING: pre-dispatch-validator.service.ts");
} else {
  const validator = readFileSync(validatorFile, "utf8");
  if (!validator.includes("checkDriverInsuranceSchedule")) errors.push("Validator missing checkDriverInsuranceSchedule function");
  if (!validator.includes("INS-SCHEDULE-NOT-ON-POLICY")) errors.push("Validator missing INS-SCHEDULE-NOT-ON-POLICY rule_id");
  if (!validator.includes("driver_insurance_schedule")) errors.push("Validator missing driver_insurance_schedule check registration");
  if (!validator.includes("INSURANCE_SCHEDULE_WARNING_ENABLED")) errors.push("Validator missing feature flag check");
}

// 3. Schedule-confirmations route file exists
const routeFile = join(repoRoot, "apps/backend/src/insurance/schedule-confirmations.routes.ts");
if (!existsSync(routeFile)) {
  errors.push("MISSING: apps/backend/src/insurance/schedule-confirmations.routes.ts");
} else {
  const route = readFileSync(routeFile, "utf8");
  if (!route.includes("schedule-confirmations")) errors.push("Route missing schedule-confirmations endpoint");
  if (!route.includes("INSERT INTO insurance.schedule_confirmations")) errors.push("Route missing INSERT into schedule_confirmations");
}

// 4. Route registered in index.ts
const indexFile = join(repoRoot, "apps/backend/src/index.ts");
if (!existsSync(indexFile)) {
  errors.push("MISSING: apps/backend/src/index.ts");
} else {
  const index = readFileSync(indexFile, "utf8");
  if (!index.includes("registerInsuranceScheduleConfirmationRoutes")) errors.push("index.ts missing registerInsuranceScheduleConfirmationRoutes import/registration");
}

// 5. Frontend logs confirmations
const frontendFile = join(repoRoot, "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx");
if (!existsSync(frontendFile)) {
  errors.push("MISSING: PreDispatchValidationPanel.tsx");
} else {
  const frontend = readFileSync(frontendFile, "utf8");
  if (!frontend.includes("INS-SCHEDULE-NOT-ON-POLICY")) errors.push("Frontend missing INS-SCHEDULE-NOT-ON-POLICY rule_id");
  if (!frontend.includes("schedule-confirmations")) errors.push("Frontend missing schedule-confirmations API call");
  if (!frontend.includes("The confirm cannot be bypassed")) errors.push("Frontend missing confirm-cannot-be-bypassed comment");
}

if (errors.length > 0) {
  console.error("FAIL: insurance-schedule-warning-guard verification failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log("PASS: insurance-schedule-warning-guard verified — migration, validator, route, registration, frontend all present.");
process.exit(0);
