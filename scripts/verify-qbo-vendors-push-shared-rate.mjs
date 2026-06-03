#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const sharedPath = path.join(ROOT, "apps/backend/src/sync/qbo-master-push-rate-limit.ts");
const vendorsPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-vendors-push.ts");
const customersPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-customers-push.ts");

function fail(message) {
  console.error(`verify:qbo-vendors-push-shared-rate — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [sharedPath, vendorsPushPath, customersPushPath]) {
  if (!fs.existsSync(file)) fail(`${file.replace(`${ROOT}/`, "")} not found`);
}

const sharedText = fs.readFileSync(sharedPath, "utf8");
const vendorsText = fs.readFileSync(vendorsPushPath, "utf8");
const customersText = fs.readFileSync(customersPushPath, "utf8");

if (!sharedText.includes("QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100")) {
  fail("shared master push limit must remain 100/min for combined B8+B9 budget");
}
if (!vendorsText.includes("canPushWithinMasterRateLimit")) {
  fail("vendors push scheduler must enforce shared canPushWithinMasterRateLimit");
}
if (!customersText.includes("canPushWithinMasterRateLimit")) {
  fail("customers push scheduler must enforce shared canPushWithinMasterRateLimit");
}
if (!vendorsText.includes("recordQboMasterPushAttempt")) {
  fail("vendors push scheduler must record attempts in shared rate window");
}
if (!customersText.includes("recordQboMasterPushAttempt")) {
  fail("customers push scheduler must record attempts in shared rate window");
}

console.log("verify:qbo-vendors-push-shared-rate — OK");
