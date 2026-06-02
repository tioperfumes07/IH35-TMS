#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = fs.readFileSync(path.join(ROOT, "apps/backend/src/shipper-portal/portal-api.routes.ts"), "utf8");

const forbidden = [
  "rate_total_cents",
  "dispatcher_user_id",
  "notes",
  "driver_pay",
  "profit_margin",
  "cost_basis",
  "assigned_primary_driver_name",
];

for (const field of forbidden) {
  if (api.includes(field)) {
    console.error(`verify:shipper-portal-no-internal-data-leak FAIL: portal API references ${field}`);
    process.exit(1);
  }
}

if (!api.includes("sanitizeLoadRow")) {
  console.error("verify:shipper-portal-no-internal-data-leak FAIL: sanitizeLoadRow helper missing");
  process.exit(1);
}

console.log("verify:shipper-portal-no-internal-data-leak PASS");
