#!/usr/bin/env node
// SAF-F7527A: the integrity-alert engine must never synthesize a subject_key for one entity
// type (driver, unit) from a DIFFERENT entity's id when the real one is absent — that is not
// a finding, it is noise pointed at nobody (or worse, a real record it doesn't belong to).
// Guards both the fuel_anomaly branch (was: driver:<dot_inspection_id> when driver_id NULL)
// and its twin in the odometer_cost_mismatch branch (was: unit:<wo_id> when unit_id NULL).
import fs from "node:fs";

const FILE = "apps/backend/src/safety/integrity-alert-engine.service.ts";

function inspect(source) {
  const failures = [];

  // The fabrication anti-pattern itself must never reappear.
  if (/row\.driver_id\s*\?\?\s*row\.fuel_expense_id/.test(source)) {
    failures.push("fuel_anomaly branch fabricates a driver: subject from fuel_expense_id when driver_id is absent");
  }
  if (/row\.unit_id\s*\?\?\s*row\.wo_id/.test(source)) {
    failures.push("odometer_cost_mismatch branch fabricates a unit: subject from wo_id when unit_id is absent");
  }

  // The fix: both branches must filter out rows missing the real id before mapping to a subject.
  if (!/rule_code === "fuel_anomaly"[\s\S]{0,700}\.filter\(\(row\) => Boolean\(row\.driver_id\)\)[\s\S]{0,300}subject_key: `driver:\$\{String\(row\.driver_id\)\}`/.test(source)) {
    failures.push("fuel_anomaly branch does not filter out rows with no real driver_id before building subject_key");
  }
  if (!/rule_code === "odometer_cost_mismatch"[\s\S]{0,700}\.filter\(\(row\) => Boolean\(row\.unit_id\)\)[\s\S]{0,300}subject_key: `unit:\$\{String\(row\.unit_id\)\}`/.test(source)) {
    failures.push("odometer_cost_mismatch branch does not filter out rows with no real unit_id before building subject_key");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const mutated = real
    .replace(
      /return res\.rows\s*\n\s*\.filter\(\(row\) => Boolean\(row\.driver_id\)\)\s*\n\s*\.map\(\(row\) => \(\{\s*\n\s*subject_key: `driver:\$\{String\(row\.driver_id\)\}`,/,
      "return res.rows.map((row) => ({\n        subject_key: `driver:${String(row.driver_id ?? row.fuel_expense_id)}`,"
    );
  if (mutated === real) {
    console.error("verify-integrity-alert-engine-no-subject-fabrication --selftest: mutation regex did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  const realFailures = inspect(real);
  if (mutatedFailures.length === 0) {
    console.error("verify-integrity-alert-engine-no-subject-fabrication --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  if (realFailures.length !== 0) {
    console.error("verify-integrity-alert-engine-no-subject-fabrication --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  console.log("verify-integrity-alert-engine-no-subject-fabrication --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-integrity-alert-engine-no-subject-fabrication FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-integrity-alert-engine-no-subject-fabrication: OK — no cross-entity subject fabrication in fuel_anomaly or odometer_cost_mismatch branches");
