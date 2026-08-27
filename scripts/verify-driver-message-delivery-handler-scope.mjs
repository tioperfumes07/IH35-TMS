#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/outbox/handlers/driver-profile-message-delivery.handler.ts";
const source = fs.readFileSync(file, "utf8");
const checks = [
  'const driverId = requiredText(payload, "driver_id")',
  "WHERE id = $1::uuid AND operating_company_id = $2::uuid AND driver_id = $4::uuid",
  "[messageId, companyId, deliveryRef, driverId]",
  'throw new Error("driver_profile_message_delivery_row_not_found")',
];

function inspect(value) {
  return checks.filter((check) => !value.includes(check));
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-driver-message-delivery-handler-scope FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const check of checks.slice(0, 3)) {
    if (inspect(source.replace(check, "PLANTED_DEFECT")).length === 0) throw new Error(`selftest missed ${check}`);
  }
  console.log("verify-driver-message-delivery-handler-scope --selftest PASS (3/3 planted defects red)");
  process.exit(0);
}

console.log("verify-driver-message-delivery-handler-scope PASS — async sent update binds message, company, and driver from durable payload");
