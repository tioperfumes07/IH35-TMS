#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "apps/backend/src/compliance/compliance-aggregate.service.ts"), "utf8");
const checks = [
  ["daysUntil < 0 || daysUntil < 7", "red threshold"],
  ["daysUntil <= 30", "yellow threshold"],
  ['return "green"', "green threshold"],
];
for (const [needle, label] of checks) {
  if (!src.includes(needle)) {
    console.error(`verify:compliance-severity-thresholds FAIL: missing ${label}`);
    process.exit(1);
  }
}
console.log("verify:compliance-severity-thresholds PASS");
