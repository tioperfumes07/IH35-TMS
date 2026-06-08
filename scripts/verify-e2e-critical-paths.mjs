#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = path.join(ROOT, "apps/frontend/e2e/critical-paths");
const REQUIRED = [
  "01-driver-fuel-expense.spec.ts",
  "02-dispatch-book-assign.spec.ts",
  "03-invoice-send-paid.spec.ts",
  "04-bill-schedule-pay.spec.ts",
  "05-settlement-finalize-pdf.spec.ts",
  "06-banking-reconcile.spec.ts",
  "07-maintenance-work-order.spec.ts",
  "08-safety-map-hos.spec.ts",
  "09-reports-pl-export.spec.ts",
  "10-admin-invite-user.spec.ts",
];

function fail(msg) {
  console.error(`verify:e2e-critical-paths FAIL: ${msg}`);
  process.exit(1);
}

for (const file of REQUIRED) {
  const abs = path.join(SPEC_DIR, file);
  if (!fs.existsSync(abs)) fail(`missing spec ${file}`);
  const src = fs.readFileSync(abs, "utf8");
  if (src.includes("test.skip")) fail(`${file} must not be skipped`);
  if (!src.includes("installCriticalPathMocks")) fail(`${file} must use critical path harness`);
  if (!src.includes("expect(")) fail(`${file} must contain assertions`);
}

const cfg = path.join(ROOT, "apps/frontend/playwright.critical-paths.config.ts");
if (!fs.existsSync(cfg)) fail("missing playwright.critical-paths.config.ts");
const cfgSrc = fs.readFileSync(cfg, "utf8");
if (!cfgSrc.includes("retain-on-failure")) fail("playwright config must retain traces on failure");

console.log(`verify:e2e-critical-paths OK (${REQUIRED.length} specs)`);
