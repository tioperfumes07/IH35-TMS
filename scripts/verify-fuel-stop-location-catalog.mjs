#!/usr/bin/env node
/**
 * Love's / fuel_stop location catalog — AlwaysTrack settlement shape.
 *
 * Asserts the shared FuelStopLocationPicker reads mdata.locations with
 * location_type=fuel_stop and is wired into Settlement Creator, Create Fuel
 * Purchase, and Record Expense (memo). Labels prefer street address when
 * present, else Love's #N — City, ST (604-seed catalog name).
 *
 * Self-test: node scripts/verify-fuel-stop-location-catalog.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-stop-location-catalog";

const PICKER = path.join(ROOT, "apps/frontend/src/components/locations/FuelStopLocationPicker.tsx");
const LABEL_LIB = path.join(ROOT, "apps/frontend/src/lib/fuelStopLocationLabel.ts");
const MDATA_API = path.join(ROOT, "apps/frontend/src/api/mdata.ts");
const CREATOR = path.join(ROOT, "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx");
const FUEL_MODAL = path.join(ROOT, "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx");
const EXPENSE_FORM = path.join(ROOT, "apps/frontend/src/components/expenses/RecordExpenseForm.tsx");
const EXPENSE_SUBMIT = path.join(ROOT, "apps/frontend/src/components/expenses/recordExpenseSubmit.ts");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

function runChecks() {
  const failures = [];
  const picker = read(PICKER);
  const labelLib = read(LABEL_LIB);
  const mdata = read(MDATA_API);
  const creator = read(CREATOR);
  const fuelModal = read(FUEL_MODAL);
  const expenseForm = read(EXPENSE_FORM);
  const expenseSubmit = read(EXPENSE_SUBMIT);

  assert(/location_type:\s*fuelStopOnly\s*\?\s*"fuel_stop"/.test(picker) || /location_type:\s*fuelStopOnly \? "fuel_stop"/.test(picker),
    "FuelStopLocationPicker must request location_type=fuel_stop", failures);
  assert(/listLocations/.test(picker) && /formatFuelStopLocationLabel/.test(picker),
    "Picker must call listLocations + formatFuelStopLocationLabel", failures);

  assert(/address/.test(labelLib) && /Love's/.test(labelLib),
    "Label helper must prefer address then Love's catalog name", failures);

  assert(/location_type/.test(mdata) && /listLocations/.test(mdata),
    "listLocations API client must accept location_type query param", failures);

  assert(/FuelStopLocationPicker/.test(creator) && /sc-fuel-location/.test(creator),
    "Settlement Creator fuel Location must use FuelStopLocationPicker", failures);
  assert(/sc-comp-location/.test(creator) && /sc-drv-location/.test(creator),
    "Settlement Creator Comp. Exp. + Drv reimbursements must offer fuel-stop Location", failures);

  assert(/FuelStopLocationPicker/.test(fuelModal) && /fuel-create-location/.test(fuelModal),
    "Create Fuel Purchase must use FuelStopLocationPicker (not free-text city/state only)", failures);

  assert(/FuelStopLocationPicker/.test(expenseForm) && /record-expense-location/.test(expenseForm),
    "Record Expense must offer fuel-stop Location picker", failures);
  assert(/locationLabel/.test(expenseSubmit) && /buildRecordExpenseMemo/.test(expenseSubmit),
    "Expense memo must include locationLabel (AT settlement location text)", failures);

  return failures;
}

if (process.argv.includes("--selftest")) {
  const failures = runChecks();
  if (failures.length) {
    console.error(`${LABEL} --selftest: unexpected failures on current tree:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

const failures = runChecks();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS`);
