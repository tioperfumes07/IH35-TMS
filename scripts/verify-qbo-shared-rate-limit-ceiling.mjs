#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const sharedPath = path.join(ROOT, "apps/backend/src/sync/qbo-master-push-rate-limit.ts");
const customersPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-customers-push.ts");
const vendorsPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-vendors-push.ts");
const accountsPushPath = path.join(ROOT, "apps/backend/src/sync/qbo-accounts-push.ts");

function fail(message) {
  console.error(`verify:qbo-shared-rate-limit-ceiling — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [sharedPath, customersPushPath, vendorsPushPath, accountsPushPath]) {
  if (!fs.existsSync(file)) fail(`${file.replace(`${ROOT}/`, "")} not found`);
}

const sharedText = fs.readFileSync(sharedPath, "utf8");
const customersText = fs.readFileSync(customersPushPath, "utf8");
const vendorsText = fs.readFileSync(vendorsPushPath, "utf8");
const accountsText = fs.readFileSync(accountsPushPath, "utf8");

if (!sharedText.includes("QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100")) {
  fail("shared master push limit must remain 100/min for combined B8+B9+B10 budget");
}

for (const [label, text] of [
  ["customers", customersText],
  ["vendors", vendorsText],
  ["accounts", accountsText],
]) {
  if (!text.includes("canPushWithinMasterRateLimit")) {
    fail(`${label} push scheduler must enforce shared canPushWithinMasterRateLimit`);
  }
  if (!text.includes("recordQboMasterPushAttempt")) {
    fail(`${label} push scheduler must record attempts in shared rate window`);
  }
  if (!text.includes("qbo-master-push-rate-limit.js")) {
    fail(`${label} push scheduler must import qbo-master-push-rate-limit`);
  }
}

console.log("verify:qbo-shared-rate-limit-ceiling — OK");
