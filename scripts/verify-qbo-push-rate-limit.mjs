#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps/backend/src/sync/qbo-customers-push.ts");

function fail(message) {
  console.error(`verify:qbo-push-rate-limit — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/sync/qbo-customers-push.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");

if (!text.includes("QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN = 100")) {
  fail("scheduler must declare QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN = 100");
}
if (!text.includes("QBO_CUSTOMERS_PUSH_BATCH_SIZE = 100")) {
  fail("scheduler must declare QBO_CUSTOMERS_PUSH_BATCH_SIZE = 100");
}
if (!text.includes("QBO_CUSTOMERS_PUSH_INTERVAL_MS = 60_000")) {
  fail("scheduler must run every 60 seconds");
}
if (!text.includes("canPushWithinRateLimit")) {
  fail("scheduler must enforce canPushWithinRateLimit before QBO calls");
}
if (!text.includes("getQboCustomersPushRateWindowCount")) {
  fail("scheduler must track pushes inside a rolling 60s window");
}
if (!text.includes("recordQboCustomersPushAttempt")) {
  fail("scheduler must record each push attempt for rate limiting");
}

console.log("verify:qbo-push-rate-limit — OK");
