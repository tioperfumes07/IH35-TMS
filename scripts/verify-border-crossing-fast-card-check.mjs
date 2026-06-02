#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts"),
  "utf8"
);
const step5 = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/components/border-crossing/WizardStep5.tsx"),
  "utf8"
);

if (!routes.includes("fast_card_expiration")) {
  console.error("verify:border-crossing-fast-card-check FAIL: backend must read fast_card_expiration");
  process.exit(1);
}
if (!routes.includes("parseFastCardWarning")) {
  console.error("verify:border-crossing-fast-card-check FAIL: FAST card warning helper missing");
  process.exit(1);
}
if (!routes.includes("driver_fast_card_verified")) {
  console.error("verify:border-crossing-fast-card-check FAIL: must persist driver_fast_card_verified");
  process.exit(1);
}
if (!step5.includes("fast-card-status")) {
  console.error("verify:border-crossing-fast-card-check FAIL: wizard step 5 must surface FAST card status");
  process.exit(1);
}

console.log("verify:border-crossing-fast-card-check PASS");
