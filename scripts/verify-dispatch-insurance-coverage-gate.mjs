#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_DISPATCH_INSURANCE_GATE_ROOT ?? process.cwd();
const failures = [];

const servicePath = path.resolve(ROOT, "apps/backend/src/insurance/coverage-gap.service.ts");
const routesPath = path.resolve(ROOT, "apps/backend/src/dispatch/loads.routes.ts");
const bookLoadPath = path.resolve(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
const testPath = path.resolve(ROOT, "apps/backend/src/insurance/__tests__/coverage-gap.service.test.ts");

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

const service = readIfExists(servicePath);
if (!service) failures.push("missing_coverage_gap_service");
if (!service.includes("DISPATCH_REQUIRED_INSURANCE_COVERAGE_TYPES")) failures.push("missing_dispatch_required_coverage_types");
if (!service.includes("detectAssetCoverageGap")) failures.push("missing_detect_asset_coverage_gap");
if (!service.includes("gap_types")) failures.push("missing_gap_types_payload");

const routes = readIfExists(routesPath);
if (!routes.includes('/api/v1/dispatch/units/:unit_id/insurance-status')) failures.push("missing_dispatch_unit_insurance_route");
if (!routes.includes("E_UNIT_INSURANCE_COVERAGE_GAP")) failures.push("missing_dispatch_unit_insurance_block_code");

const bookLoad = readIfExists(bookLoadPath);
if (!bookLoad.includes("dispatch.book_load_blocked_by_insurance_coverage_gap"))
  failures.push("missing_insurance_gap_audit_event");
if (!bookLoad.includes("isInsuranceDispatchGateEnabled")) failures.push("missing_insurance_gate_toggle");
if (!bookLoad.includes("insurance_coverage_gap_warnings")) failures.push("missing_insurance_gap_warnings_payload");

const test = readIfExists(testPath);
if (!test.includes("coverage-gap.service")) failures.push("missing_coverage_gap_service_tests");

if (failures.length > 0) {
  console.error("verify:dispatch-insurance-coverage-gate FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:dispatch-insurance-coverage-gate OK");
