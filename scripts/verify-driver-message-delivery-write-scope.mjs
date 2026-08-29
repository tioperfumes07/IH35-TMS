#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/drivers/messages.service.ts";
const source = fs.readFileSync(file, "utf8");
const predicate = "WHERE id = $1 AND operating_company_id = $2::uuid AND driver_id = $3::uuid";
const values = ["input.messageId", "input.operatingCompanyId", "input.driverId", "input.status"];

function inspect(value) {
  const failures = [];
  const helper = value.match(/async function updateDriverMessageDeliveryStatus[\s\S]*?\n}\n/)?.[0] ?? "";
  if (!helper) failures.push("missing canonical delivery-status helper");
  if (!helper.includes(predicate)) failures.push("delivery helper omits company/driver predicate");
  if (!values.every((value) => helper.includes(value))) failures.push("delivery helper omits message/company/driver/status values");
  if (!/RETURNING id::text[\s\S]*requireDriverMessageRow\(res\.rows, "delivery_status"\)/.test(helper)) {
    failures.push("delivery helper does not require persisted row identity");
  }
  const deliver = value.split("export async function deliverDriverProfileMessage")[1] ?? "";
  const calls = deliver.match(/await updateDriverMessageDeliveryStatus\(client, \{ \.\.\.input, status: "(?:delivered|failed)" \}\);/g) ?? [];
  if (calls.length !== 4) failures.push(`expected 4 terminal helper calls, found ${calls.length}`);
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-driver-message-delivery-write-scope FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const unscoped = source.replace(predicate, "WHERE id = $1");
  if (inspect(unscoped).length === 0) throw new Error("selftest missed unscoped helper");
  const missingBranch = source.replace(/await updateDriverMessageDeliveryStatus\(client, \{ \.\.\.input, status: "failed" \}\);/, "");
  if (inspect(missingBranch).length === 0) throw new Error("selftest missed terminal branch without persistence");
  console.log("verify-driver-message-delivery-write-scope --selftest PASS (2/2 planted defects red)");
  process.exit(0);
}

console.log("verify-driver-message-delivery-write-scope PASS — delivered/failed writes bind message, company, and driver atomically");
