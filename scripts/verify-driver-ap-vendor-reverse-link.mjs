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
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  apiTypes: "apps/frontend/src/types/api.ts",
  routeManifest: "apps/frontend/src/routes/manifest.tsx",
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
  if (!/d\.id = mdata\.vendors\.driver_id/.test(src) ||
      !/d\.operating_company_id = mdata\.vendors\.operating_company_id/.test(src) ||
      !/AS driver_name/.test(src)) {
    problems.push("vendor detail producer must project the driver human label inside the vendor company scope");
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
  if (!/EntityLinkOrTombstone/.test(src) ||
      !/kind=\"driver\"/.test(src) ||
      !/id=\{vendor\.driver_id\}/.test(src) ||
      !/name=\{vendor\.driver_name\}/.test(src)) {
    problems.push("VendorDetail must render the canonical driver id+human label with tombstone fallback");
  }
  if (/label=\"Open driver profile/.test(src)) problems.push("VendorDetail must not invent a generic driver label");
  return problems;
}

function assertApi(src) {
  const problems = [];
  if (!/function getDriverApVendor/.test(src)) problems.push("mdata.ts missing getDriverApVendor");
  if (!/\/ap-vendor\?/.test(src) && !/\/ap-vendor`/.test(src)) {
    problems.push("getDriverApVendor must hit /ap-vendor");
  }
  if (!/driver_name\?: string \| null/.test(src)) problems.push("VendorOption must expose nullable driver_name");
  return problems;
}

function assertVendorRoute(src) {
  return /path="\/vendors\/:id"[\s\S]{0,240}<VendorDetailPage/.test(src)
    ? []
    : ["route manifest must mount VendorDetailPage at /vendors/:id"];
}

function assertQboVendorProfile(driversRoute, driverDetail, apiTypes) {
  const problems = [];
  if (!/AS qbo_vendor_local_id/.test(driversRoute) || !/AS qbo_vendor_name/.test(driversRoute)) {
    problems.push("driver by-id producer must return the resolved local QBO vendor id and human name");
  }
  if (!/v\.operating_company_id = mdata\.drivers\.operating_company_id/.test(driversRoute) ||
      !/v\.qbo_vendor_id = mdata\.drivers\.qbo_vendor_id/.test(driversRoute)) {
    problems.push("QBO vendor bridge must join by qbo_vendor_id inside the driver's company scope");
  }
  if (!/EntityLinkOrTombstone/.test(driverDetail) ||
      !/id=\{driver\.qbo_vendor_local_id\}/.test(driverDetail) ||
      !/name=\{driver\.qbo_vendor_name\}/.test(driverDetail)) {
    problems.push("DriverDetail QBO Mapping must drill by local vendor id with a human label/tombstone");
  }
  if (!/driver-qbo-vendor-tombstone/.test(driverDetail) ||
      !/driver\.qbo_vendor_id \? "Vendor — not visible" : "Unassigned"/.test(driverDetail)) {
    problems.push("unresolved QBO vendor bridges must render an honest non-interactive tombstone");
  }
  if (/kind="vendor" id=\{driver\.qbo_vendor_id\}/.test(driverDetail)) {
    problems.push("DriverDetail must never route the external QBO vendor id as a local vendor id");
  }
  if (!/qbo_vendor_local_id\?: string \| null/.test(apiTypes) || !/qbo_vendor_name\?: string \| null/.test(apiTypes)) {
    problems.push("Driver type must declare resolved QBO vendor identity fields");
  }
  return problems;
}

function selftest() {
  const goodD = read(PATHS.driversRoutes);
  const goodE = read(PATHS.earnings);
  const goodProfile = read(PATHS.driverDetail);
  const goodVendorDetail = read(PATHS.vendorDetail);
  const goodVendors = read(PATHS.vendorsRoutes);
  const goodManifest = read(PATHS.routeManifest);
  const goodTypes = read(PATHS.apiTypes);
  const badD = goodD.replace(/\/ap-vendor/g, "/x-vendor").replace(/resolveDriverVendorLink/g, "x");
  const badE = goodE.replace(/getDriverApVendor/g, "x").replace(/kind=\"vendor\"/g, 'kind="bill"');
  const badProfile = goodProfile
    .replace(/id=\{driver\.qbo_vendor_local_id\}/g, "id={driver.qbo_vendor_id}")
    .replace(/name=\{driver\.qbo_vendor_name\}/g, "name={null}");
  const badRoute = goodD.replace(/AS qbo_vendor_local_id/g, "AS missing_local_id");
  const badVendorScope = goodVendors.replace(
    "d.operating_company_id = mdata.vendors.operating_company_id",
    "d.operating_company_id = d.operating_company_id"
  );
  const badVendorDetail = goodVendorDetail
    .replace("EntityLinkOrTombstone", "EntityLink")
    .replace("name={vendor.driver_name}", 'name={"Open driver profile"}');
  const badManifest = goodManifest.replace('path="/vendors/:id"', 'path="/vendors/:id-disabled"');
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
  if (assertVendorsSelect(goodVendors).length) {
    console.error("good vendor producer should pass", assertVendorsSelect(goodVendors));
    failed++;
  }
  if (assertVendorsSelect(badVendorScope).length < 1) {
    console.error("planted cross-company driver label join should fail");
    failed++;
  }
  if (assertVendorDetail(goodVendorDetail).length) {
    console.error("good vendor detail should pass", assertVendorDetail(goodVendorDetail));
    failed++;
  }
  if (assertVendorDetail(badVendorDetail).length < 1) {
    console.error("planted generic driver label should fail");
    failed++;
  }
  if (assertVendorRoute(goodManifest).length || assertVendorRoute(badManifest).length < 1) {
    console.error("mounted vendor detail route mutation was not detected");
    failed++;
  }
  if (assertQboVendorProfile(goodD, goodProfile, goodTypes).length) {
    console.error("good QBO vendor profile should pass", assertQboVendorProfile(goodD, goodProfile, goodTypes));
    failed++;
  }
  if (assertQboVendorProfile(badRoute, badProfile, goodTypes).length < 2) {
    console.error("planted external-id/dead-label defects should fail independently");
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
  ...assertVendorRoute(read(PATHS.routeManifest)),
  ...assertQboVendorProfile(read(PATHS.driversRoutes), read(PATHS.driverDetail), read(PATHS.apiTypes)),
];
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Driver↔A/P vendor reverse link wired both ways`);
