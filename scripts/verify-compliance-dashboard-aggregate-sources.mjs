#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/compliance-aggregate.service.ts"), "utf8");
const required = [
  "mdata.units",
  "mdata.equipment",
  "mdata.unit_plates",
  "mdata.equipment_plates",
  "mdata.drivers",
  "safety.training_records",
  "safety.drug_test",
  "org.companies",
];
for (const table of required) {
  if (!src.includes(table)) {
    console.error(`verify:compliance-dashboard-aggregate-sources FAIL: missing query for ${table}`);
    process.exit(1);
  }
}
console.log("verify:compliance-dashboard-aggregate-sources PASS");
