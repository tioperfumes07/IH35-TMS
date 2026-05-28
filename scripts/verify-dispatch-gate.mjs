#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_DISPATCH_GATE_ROOT ?? process.cwd();
const failures = [];

const eligibilityPath = path.resolve(ROOT, "apps/backend/src/dispatch/eligibility.ts");
const bookLoadPath = path.resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
const loadsRoutesPath = path.resolve(ROOT, "apps/backend/src/dispatch/loads.routes.ts");
const indexPath = path.resolve(ROOT, "apps/backend/src/index.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const eligibility = readIfExists(eligibilityPath);
if (!eligibility) failures.push("missing_dispatch_eligibility_module");
if (!eligibility.includes("evaluateDriverEligibility")) failures.push("missing_evaluateDriverEligibility");
if (!eligibility.includes("loadDriverEligibility")) failures.push("missing_loadDriverEligibility");
if (!eligibility.includes("isInsuranceGateEnabled")) failures.push("missing_insurance_gate_flag");
if (!eligibility.includes("dqf_incomplete")) failures.push("missing_dqf_gate_reason");

const bookLoad = readIfExists(bookLoadPath);
if (!bookLoad.includes("loadDriverEligibility")) failures.push("missing_book_load_eligibility_hook");
if (!bookLoad.includes("E_DRIVER_DISPATCH_INELIGIBLE")) failures.push("missing_dispatch_ineligible_error");

const loadsRoutes = readIfExists(loadsRoutesPath);
if (!loadsRoutes.includes("/api/v1/dispatch/drivers/:driver_id/eligibility"))
  failures.push("missing_driver_eligibility_route");

const index = readIfExists(indexPath);
if (!index.includes("loads.routes")) failures.push("missing_dispatch_routes_bootstrap");

if (failures.length > 0) {
  console.error("verify:dispatch-gate FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:dispatch-gate OK");
