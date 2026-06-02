#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const job = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/compliance-reminder.job.ts"), "utf8");

if (!job.includes("createNotification")) {
  console.error("verify:notification-center-compliance-wired FAIL: compliance reminder must call createNotification");
  process.exit(1);
}
if (!job.includes('channel === "in_app"')) {
  console.error("verify:notification-center-compliance-wired FAIL: in_app channel branch missing");
  process.exit(1);
}
if (!job.includes("compliance_reminder")) {
  console.error("verify:notification-center-compliance-wired FAIL: source_block compliance_reminder missing");
  process.exit(1);
}

console.log("verify:notification-center-compliance-wired PASS");
