#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const target = path.join(ROOT, "apps/backend/src/fleet/trailer-status-state-machine.ts");

if (!fs.existsSync(target)) {
  console.error("verify:trailer-status-state-machine-coverage FAIL: missing state machine module");
  process.exit(1);
}

const text = fs.readFileSync(target, "utf8");
const required = ["InService", "OutOfService", "InMaintenance", "Sold", "Lost", "Damaged", "Transferred"];

if (!text.includes("export const TRAILER_STATUS_TRANSITIONS")) {
  console.error("verify:trailer-status-state-machine-coverage FAIL: TRAILER_STATUS_TRANSITIONS missing");
  process.exit(1);
}

for (const status of required) {
  if (!text.includes(`${status}:`)) {
    console.error(`verify:trailer-status-state-machine-coverage FAIL: no rules for ${status}`);
    process.exit(1);
  }
}

if (!text.includes("validateTrailerStatusTransition")) {
  console.error("verify:trailer-status-state-machine-coverage FAIL: validator missing");
  process.exit(1);
}

console.log("verify:trailer-status-state-machine-coverage PASS");
