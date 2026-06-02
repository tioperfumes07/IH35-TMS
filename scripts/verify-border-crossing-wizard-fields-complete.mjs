#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(ROOT, "db/migrations/0313_border_crossing_wizard.sql"), "utf8");
const routes = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts"),
  "utf8"
);

const requiredColumns = [
  "planned_crossing_date",
  "commodity_value_cents",
  "cargo_weight_lbs",
  "customs_broker_id",
  "customs_broker_status",
  "emanifest_status",
  "emanifest_reference",
  "driver_fast_card_verified",
  "hazmat_declared",
  "bond_number",
  "wizard_completed_at",
  "wizard_completed_by_user_id",
];

for (const col of requiredColumns) {
  if (!sql.includes(col)) {
    console.error(`verify:border-crossing-wizard-fields-complete FAIL: missing column ${col}`);
    process.exit(1);
  }
}

if (!sql.includes("reference.ports_of_entry")) {
  console.error("verify:border-crossing-wizard-fields-complete FAIL: ports_of_entry table missing");
  process.exit(1);
}

if (!routes.includes("wizard_completed_at")) {
  console.error("verify:border-crossing-wizard-fields-complete FAIL: wizard route must persist wizard fields");
  process.exit(1);
}

console.log("verify:border-crossing-wizard-fields-complete PASS");
