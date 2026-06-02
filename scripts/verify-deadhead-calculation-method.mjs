#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const service = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/deadhead.service.ts"), "utf8");

const required = ["samsara", "manual", "estimated", "deadhead_miles_calculation_method", "resolveDeadheadToPickup"];
for (const token of required) {
  if (!service.includes(token)) {
    console.error(`verify:deadhead-calculation-method FAIL: missing ${token}`);
    process.exit(1);
  }
}

if (!service.includes("miles_deadhead")) {
  console.error("verify:deadhead-calculation-method FAIL: must account for legacy miles_deadhead column");
  process.exit(1);
}

console.log("verify:deadhead-calculation-method PASS");
