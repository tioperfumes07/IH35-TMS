#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHARED = path.join(ROOT, "apps/backend/src/sync/qbo-master-push-rate-limit.ts");
const CUSTOMERS = path.join(ROOT, "apps/backend/src/sync/qbo-customers-push.ts");
const VENDORS = path.join(ROOT, "apps/backend/src/sync/qbo-vendors-push.ts");

function fail(message) {
  console.error(`verify:qbo-push-rate-limit — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [SHARED, CUSTOMERS, VENDORS]) {
  if (!fs.existsSync(file)) fail(`${file.replace(`${ROOT}/`, "")} not found`);
}

const sharedText = fs.readFileSync(SHARED, "utf8");
const customersText = fs.readFileSync(CUSTOMERS, "utf8");
const vendorsText = fs.readFileSync(VENDORS, "utf8");

if (!sharedText.includes("QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100")) {
  fail("shared rate limiter must declare QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN = 100");
}
if (!sharedText.includes("canPushWithinMasterRateLimit")) {
  fail("shared rate limiter must export canPushWithinMasterRateLimit");
}
if (!sharedText.includes("recordQboMasterPushAttempt")) {
  fail("shared rate limiter must track push attempts in a rolling 60s window");
}

if (!customersText.includes("qbo-master-push-rate-limit.js")) {
  fail("customers push scheduler must import shared qbo-master-push-rate-limit");
}
if (!vendorsText.includes("qbo-master-push-rate-limit.js")) {
  fail("vendors push scheduler must import shared qbo-master-push-rate-limit");
}
if (!customersText.includes("recordQboMasterPushAttempt")) {
  fail("customers push scheduler must record attempts via shared rate limiter");
}
if (!vendorsText.includes("recordQboMasterPushAttempt")) {
  fail("vendors push scheduler must record attempts via shared rate limiter");
}

if (!customersText.includes("QBO_CUSTOMERS_PUSH_BATCH_SIZE = 100")) {
  fail("customers scheduler must declare QBO_CUSTOMERS_PUSH_BATCH_SIZE = 100");
}
if (!vendorsText.includes("QBO_VENDORS_PUSH_BATCH_SIZE = 100")) {
  fail("vendors scheduler must declare QBO_VENDORS_PUSH_BATCH_SIZE = 100");
}
if (!customersText.includes("QBO_CUSTOMERS_PUSH_INTERVAL_MS = 60_000")) {
  fail("customers scheduler must run every 60 seconds");
}
if (!vendorsText.includes("QBO_VENDORS_PUSH_INTERVAL_MS = 60_000")) {
  fail("vendors scheduler must run every 60 seconds");
}

console.log("verify:qbo-push-rate-limit — OK");
