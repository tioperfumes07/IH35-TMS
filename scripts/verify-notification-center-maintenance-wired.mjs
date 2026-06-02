#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const predictor = fs.readFileSync(path.join(ROOT, "apps/backend/src/telematics/maintenance-predictor.service.ts"), "utf8");

if (!predictor.includes("createNotification")) {
  console.error("verify:notification-center-maintenance-wired FAIL: maintenance predictor must call createNotification");
  process.exit(1);
}
if (!predictor.includes("maintenance_alert")) {
  console.error("verify:notification-center-maintenance-wired FAIL: maintenance_alert type missing");
  process.exit(1);
}
if (!predictor.includes("maintenance_pm")) {
  console.error("verify:notification-center-maintenance-wired FAIL: source_block maintenance_pm missing");
  process.exit(1);
}

console.log("verify:notification-center-maintenance-wired PASS");
