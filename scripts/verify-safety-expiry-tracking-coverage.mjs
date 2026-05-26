#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_EXPIRY_ROOT ?? process.cwd();
const files = [
  "apps/backend/src/safety/driver-profile.routes.ts",
  "apps/backend/src/safety/driver-qualification.routes.ts",
  "apps/backend/src/safety/medical-cards.routes.ts",
  "apps/backend/src/safety/background-checks.routes.ts",
  "apps/backend/src/safety/training-records.routes.ts",
];

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const source = files.map((file) => read(path.resolve(ROOT, file))).join("\n");
  const failures = [];

  const checks = [
    { id: "pill-function", pattern: /function expiryPill\(/ },
    { id: "dq-expiry-column", pattern: /expiry_date/ },
    { id: "medical-expiry-column", pattern: /medical_days_to_expiry|expiry_date/ },
    { id: "background-expiry-column", pattern: /background_checks[\s\S]*expiry_date|expiry_date/ },
    { id: "training-expiry-column", pattern: /training_records[\s\S]*expiry_date|expiry_date/ },
  ];

  for (const check of checks) {
    if (!check.pattern.test(source)) failures.push(`missing_pattern:${check.id}`);
  }

  if (failures.length > 0) {
    console.error("verify:safety-expiry-tracking-coverage FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-expiry-tracking-coverage OK");
}

main();
