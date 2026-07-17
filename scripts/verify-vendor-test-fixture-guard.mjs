#!/usr/bin/env node
// VEND-3 CI guard: vendors.routes.ts must reject TEST-VENDOR fixture names on create AND patch.
// Complements verify-no-test-fixture-names.mjs (static source scan) with a runtime-route contract check.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-test-fixture-guard";

const PATTERN_FILE = "apps/backend/src/mdata/fixture-vendor-name-pattern.ts";
const VENDORS_ROUTE = "apps/backend/src/mdata/vendors.routes.ts";

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertGuard(patternSrc, routeSrc) {
  const failures = [];

  if (!/export const TEST_VENDOR_FIXTURE_RE/.test(patternSrc)) {
    failures.push(`${PATTERN_FILE}: missing TEST_VENDOR_FIXTURE_RE export`);
  }
  if (!/export function isTestVendorFixtureName/.test(patternSrc)) {
    failures.push(`${PATTERN_FILE}: missing isTestVendorFixtureName helper`);
  }
  if (!/test\[-_ \]vendor/i.test(patternSrc)) {
    failures.push(`${PATTERN_FILE}: TEST_VENDOR_FIXTURE_RE must match test[-_ ]vendor (case-insensitive)`);
  }

  if (!routeSrc.includes('from "./fixture-vendor-name-pattern.js"')) {
    failures.push(`${VENDORS_ROUTE}: must import isTestVendorFixtureName from fixture-vendor-name-pattern.js`);
  }
  if (!routeSrc.includes("isTestVendorFixtureName(b.name)")) {
    failures.push(`${VENDORS_ROUTE}: create/patch paths must call isTestVendorFixtureName(b.name)`);
  }
  if (!routeSrc.includes('error: "mdata_vendor_test_fixture_rejected"')) {
    failures.push(`${VENDORS_ROUTE}: must return error mdata_vendor_test_fixture_rejected`);
  }
  if (!/reply\.code\(422\)/.test(routeSrc)) {
    failures.push(`${VENDORS_ROUTE}: fixture rejection must use HTTP 422`);
  }
  if (!/IS_PROD_ENV && isTestVendorFixtureName\(b\.name\)/.test(routeSrc)) {
    failures.push(`${VENDORS_ROUTE}: guard must be prod-scoped via IS_PROD_ENV && isTestVendorFixtureName(b.name)`);
  }

  // Create path: guard appears before vendorNameConflictExists on POST handler.
  const postIdx = routeSrc.indexOf('app.post("/api/v1/mdata/vendors"');
  const patchIdx = routeSrc.indexOf('app.patch("/api/v1/mdata/vendors/:id"');
  if (postIdx === -1 || patchIdx === -1) {
    failures.push(`${VENDORS_ROUTE}: expected POST and PATCH vendor routes`);
  } else {
    const createSlice = routeSrc.slice(postIdx, patchIdx);
    const patchSlice = routeSrc.slice(patchIdx);
    if (!createSlice.includes("isTestVendorFixtureName(b.name)")) {
      failures.push(`${VENDORS_ROUTE}: POST create handler missing isTestVendorFixtureName guard`);
    }
    if (!patchSlice.includes("isTestVendorFixtureName(b.name)")) {
      failures.push(`${VENDORS_ROUTE}: PATCH update handler missing isTestVendorFixtureName guard`);
    }
  }

  return failures;
}

function runSelftest() {
  const goodPattern = read(PATTERN_FILE);
  const goodRoute = read(VENDORS_ROUTE);
  const goodFailures = assertGuard(goodPattern, goodRoute);
  if (goodFailures.length > 0) {
    console.error(`[${LABEL}] --selftest FAIL: current tree should pass but got:`);
    for (const f of goodFailures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  const badRoute = goodRoute.replace(/isTestVendorFixtureName\(b\.name\)/g, "false /* stripped */");
  const badFailures = assertGuard(goodPattern, badRoute);
  if (badFailures.length === 0) {
    console.error(`[${LABEL}] --selftest FAIL: stripped guard should fail but passed`);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest PASS (${badFailures.length} injected regressions caught)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
}

const failures = assertGuard(read(PATTERN_FILE), read(VENDORS_ROUTE));
if (failures.length > 0) {
  console.error(`[${LABEL}] FAIL:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`[${LABEL}] PASS — vendors.routes.ts rejects TEST-VENDOR on create + patch in production`);
