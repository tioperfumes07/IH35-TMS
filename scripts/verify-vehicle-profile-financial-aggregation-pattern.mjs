#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "apps/backend/src/mdata/unit-financial.service.ts");
const src = fs.readFileSync(file, "utf8");
const needles = ["assigned_unit_id", "driver_finance.driver_bills", "load_scope", "fuel.fuel_transactions", "maintenance.work_orders"];
for (const n of needles) {
  if (!src.includes(n)) {
    console.error(`verify:vehicle-profile-financial-aggregation-pattern FAIL: missing ${n}`);
    process.exit(1);
  }
}
console.log("verify:vehicle-profile-financial-aggregation-pattern PASS");
