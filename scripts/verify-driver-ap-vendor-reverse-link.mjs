#!/usr/bin/env node
/**
 * GUARD: FAIL-AP1 — Driver ↔ A/P vendor reverse linkage is wired both ways.
 *
 * Defect: mdata.vendors.driver_id existed and posters resolved it, but Driver → Earnings & Debt
 * had no A/P vendor surface and Vendor detail did not show the linked driver. Operators could not
 * drill payee bills from the driver (Cascade: 3 bills / $1,350 already on driver-vendors).
 *
 * Run: node scripts/verify-driver-ap-vendor-reverse-link.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-ap-vendor-reverse-link";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PATHS = {
  driversRoutes: "apps/backend/src/mdata/drivers.routes.ts",
  vendorsRoutes: "apps/backend/src/mdata/vendors.routes.ts",
  earnings: "apps/frontend/src/components/drivers/EarningsTab.tsx",
  vendorDetail: "apps/frontend/src/pages/VendorDetail.tsx",
  mdataApi: "apps/frontend/src/api/mdata.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertDriversRoute(src) {
  const problems = [];
  if (!/\/api\/v1\/mdata\/drivers\/:id\/ap-vendor/.test(src)) {
    problems.push("drivers.routes missing GET .../drivers/:id/ap-vendor");
  }
  if (!/resolveDriverVendorLink/.test(src)) {
    problems.push("ap-vendor route must reuse resolveDriverVendorLink (no invented vendor id)");
  }
  if (!/DriverVendorMissingError/.test(src)) {
    problems.push("ap-vendor route must soft-miss on DriverVendorMissingError");
  }
  return problems;
}

function assertVendorsSelect(src) {
  const problems = [];
  if (!/VENDOR_SELECT_COLUMNS[\s\S]*driver_id/.test(src)) {
    problems.push("vendors VENDOR_SELECT_COLUMNS must expose driver_id for VendorDetail reverse");
  }
  return problems;
}

function assertEarnings(src) {
  const problems = [];
  if (!/getDriverApVendor/.test(src)) problems.push("EarningsTab missing getDriverApVendor");
  if (!/driver-earnings-ap-vendor/.test(src)) problems.push("EarningsTab missing ap-vendor test id");
  if (!/kind=\"vendor\"/.test(src)) problems.push("EarningsTab must EntityLink kind=vendor");
  if (!/listVendorBills/.test(src)) problems.push("EarningsTab must load open bills for linked vendor");
  return problems;
}

function assertVendorDetail(src) {
  const problems = [];
  if (!/vendor-linked-driver/.test(src)) problems.push("VendorDetail missing linked-driver surface");
  if (!/kind=\"driver\"/.test(src)) problems.push("VendorDetail must EntityLink kind=driver");
  if (!/driver_id/.test(src)) problems.push("VendorDetail must read vendor.driver_id");
  return problems;
}

function assertApi(src) {
  const problems = [];
  if (!/function getDriverApVendor/.test(src)) problems.push("mdata.ts missing getDriverApVendor");
  if (!/\/ap-vendor\?/.test(src) && !/\/ap-vendor`/.test(src)) {
    problems.push("getDriverApVendor must hit /ap-vendor");
  }
  return problems;
}

function selftest() {
  const goodD = read(PATHS.driversRoutes);
  const goodE = read(PATHS.earnings);
  const badD = goodD.replace(/\/ap-vendor/g, "/x-vendor").replace(/resolveDriverVendorLink/g, "x");
  const badE = goodE.replace(/getDriverApVendor/g, "x").replace(/kind=\"vendor\"/g, 'kind="bill"');
  let failed = 0;
  if (assertDriversRoute(goodD).length) {
    console.error("good drivers route should pass", assertDriversRoute(goodD));
    failed++;
  }
  if (assertDriversRoute(badD).length < 1) {
    console.error("bad drivers route should fail");
    failed++;
  }
  if (assertEarnings(goodE).length) {
    console.error("good EarningsTab should pass", assertEarnings(goodE));
    failed++;
  }
  if (assertEarnings(badE).length < 1) {
    console.error("bad EarningsTab should fail");
    failed++;
  }
  if (failed) {
    console.error(`${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = [
  ...assertDriversRoute(read(PATHS.driversRoutes)),
  ...assertVendorsSelect(read(PATHS.vendorsRoutes)),
  ...assertEarnings(read(PATHS.earnings)),
  ...assertVendorDetail(read(PATHS.vendorDetail)),
  ...assertApi(read(PATHS.mdataApi)),
];
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Driver↔A/P vendor reverse link wired both ways`);
