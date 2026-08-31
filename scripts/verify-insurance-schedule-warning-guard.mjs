/**
 * verify-insurance-schedule-warning-guard — owner ruling 331282f
 *
 * Warn+confirm (not hard block) when driver is not on insurance.policy schedule
 * membership. Build on insurance.driver_schedule — never assigned_driver_id.
 * Confirmations append-logged via insurance.schedule_confirmations.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LABEL = "verify-insurance-schedule-warning-guard";
const repoRoot = process.cwd();

const migrationFile = join(repoRoot, "db/migrations/202613311200_insurance_driver_schedule_and_confirmations.sql");
const validatorFile = join(repoRoot, "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts");
const routeFile = join(repoRoot, "apps/backend/src/insurance/schedule-confirmations.routes.ts");
const indexFile = join(repoRoot, "apps/backend/src/index.ts");
const frontendFile = join(repoRoot, "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx");

function collectErrors(files) {
  const errors = [];
  const { migration, validator, route, index, frontend } = files;

  if (!migration) {
    errors.push("MISSING: db/migrations/202613311200_insurance_driver_schedule_and_confirmations.sql");
  } else {
    if (!migration.includes("insurance.driver_schedule")) errors.push("Migration missing insurance.driver_schedule table");
    if (!migration.includes("insurance.schedule_confirmations")) errors.push("Migration missing insurance.schedule_confirmations table");
    if (!migration.includes("FORCE ROW LEVEL SECURITY")) errors.push("Migration missing FORCE RLS");
    if (!migration.includes("INSURANCE_SCHEDULE_WARNING_ENABLED")) errors.push("Migration missing feature flag");
    if (!migration.includes("GRANT SELECT, INSERT ON insurance.schedule_confirmations")) {
      errors.push("Migration missing append-only grant for confirmations");
    }
  }

  if (!validator) {
    errors.push("MISSING: pre-dispatch-validator.service.ts");
  } else {
    if (!validator.includes("checkDriverInsuranceSchedule")) errors.push("Validator missing checkDriverInsuranceSchedule function");
    if (!validator.includes("INS-SCHEDULE-NOT-ON-POLICY")) errors.push("Validator missing INS-SCHEDULE-NOT-ON-POLICY rule_id");
    if (!validator.includes("driver_insurance_schedule")) errors.push("Validator missing driver_insurance_schedule check registration");
    if (!validator.includes("INSURANCE_SCHEDULE_WARNING_ENABLED")) errors.push("Validator missing feature flag check");
  }

  if (!route) {
    errors.push("MISSING: apps/backend/src/insurance/schedule-confirmations.routes.ts");
  } else {
    if (!route.includes("schedule-confirmations")) errors.push("Route missing schedule-confirmations endpoint");
    if (!route.includes("INSERT INTO insurance.schedule_confirmations")) errors.push("Route missing INSERT into schedule_confirmations");
  }

  if (!index) {
    errors.push("MISSING: apps/backend/src/index.ts");
  } else if (!index.includes("registerScheduleConfirmationRoutes")) {
    errors.push("index.ts missing registerScheduleConfirmationRoutes import/registration");
  }

  if (!frontend) {
    errors.push("MISSING: PreDispatchValidationPanel.tsx");
  } else {
    if (!frontend.includes("INS-SCHEDULE-NOT-ON-POLICY")) errors.push("Frontend missing INS-SCHEDULE-NOT-ON-POLICY rule_id");
    if (!frontend.includes("schedule-confirmations")) errors.push("Frontend missing schedule-confirmations API call");
    if (!frontend.includes("The confirm cannot be bypassed")) errors.push("Frontend missing confirm-cannot-be-bypassed comment");
  }

  return errors;
}

function readAll() {
  return {
    migration: existsSync(migrationFile) ? readFileSync(migrationFile, "utf8") : null,
    validator: existsSync(validatorFile) ? readFileSync(validatorFile, "utf8") : null,
    route: existsSync(routeFile) ? readFileSync(routeFile, "utf8") : null,
    index: existsSync(indexFile) ? readFileSync(indexFile, "utf8") : null,
    frontend: existsSync(frontendFile) ? readFileSync(frontendFile, "utf8") : null,
  };
}

function selftest() {
  const good = readAll();
  const baseline = collectErrors(good);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — live tree already red: ${baseline.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["drop driver_schedule table name", (f) => ({ ...f, migration: f.migration.replaceAll("insurance.driver_schedule", "insurance.zzz_driver_sched") })],
    ["drop rule_id", (f) => ({ ...f, validator: f.validator.replaceAll("INS-SCHEDULE-NOT-ON-POLICY", "INS-SCHEDULE-GONE") })],
    ["drop confirmations INSERT", (f) => ({ ...f, route: f.route.replace("INSERT INTO insurance.schedule_confirmations", "SELECT 1") })],
    ["drop index registration", (f) => ({ ...f, index: f.index.replaceAll("registerScheduleConfirmationRoutes", "registerNope") })],
    ["drop frontend confirm API", (f) => ({ ...f, frontend: f.frontend.replaceAll("schedule-confirmations", "schedule-nope") })],
  ];

  for (const [name, mut] of mutations) {
    const errs = collectErrors(mut(good));
    if (errs.length === 0) {
      console.error(`${LABEL} --selftest FAIL — planted defect not caught: ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length}/${mutations.length} planted defects caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = collectErrors(readAll());
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} OK — migration, validator, route, registration, frontend wired for warn+confirm`);
