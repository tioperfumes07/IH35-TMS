#!/usr/bin/env node
/**
 * 0441-mod9 / 0441-mod2 — maintenance vendor -> AP vendor linkage via metadata.mdata_vendor_id.
 * Static guard: create/patch schemas + buildVendorMetadata write path + FE picker wired.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  routes: path.join(ROOT, "apps/backend/src/maintenance/vendors.routes.ts"),
  vendorsPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  vendorDetailPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/VendorDetailPage.tsx"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

export function checkLinkage(routes, vendorsPage, maintenanceApi, vendorDetailPage) {
  const failures = [];

  if (!/mdata_vendor_id:\s*z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(routes)) {
    failures.push("createSchema must accept mdata_vendor_id (uuid nullable optional)");
  }
  if (!routes.includes("mdata_vendor_id?: string | null")) {
    failures.push("buildVendorMetadata must accept mdata_vendor_id");
  }
  if (!/mdata_vendor_id:\s*typeof metadata\.mdata_vendor_id/.test(routes)) {
    failures.push("mapVendorRow must expose metadata.mdata_vendor_id");
  }
  if (!routes.includes("assertMdataVendorExists")) {
    failures.push("vendors.routes must validate mdata_vendor_id against mdata.vendors on write");
  }
  if (!routes.includes("FROM mdata.vendors WHERE id = $1")) {
    failures.push("vendors.routes must query canonical mdata.vendors (not qbo mirror)");
  }
  if (routes.includes("mdata.qbo_vendors")) {
    failures.push("vendors.routes must not read mdata.qbo_vendors for AP linkage");
  }

  if (!vendorsPage.includes("listVendors")) failures.push("VendorsPage must load AP vendors via listVendors");
  if (!vendorsPage.includes("mdata_vendor_id")) failures.push("VendorsPage must wire mdata_vendor_id in create/edit");
  if (!vendorsPage.includes("AP Vendor")) failures.push("VendorsPage must label AP vendor picker");

  if (!maintenanceApi.includes("mdata_vendor_id: string | null")) {
    failures.push("MaintenanceVendorRow type must include mdata_vendor_id");
  }

  if (!vendorDetailPage.includes("vendor.mdata_vendor_id")) {
    failures.push("VendorDetailPage must show linked AP vendor");
  }

  return failures;
}

export function run() {
  try {
    return checkLinkage(
      read(paths.routes),
      read(paths.vendorsPage),
      read(paths.maintenanceApi),
      read(paths.vendorDetailPage)
    );
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function selftest() {
  const goodRoutes = `
    mdata_vendor_id: z.string().uuid().nullable().optional(),
    function buildVendorMetadata(input: { mdata_vendor_id?: string | null }) {
      return { ...(input.mdata_vendor_id !== undefined ? { mdata_vendor_id: input.mdata_vendor_id } : {}) };
    }
    mdata_vendor_id: typeof metadata.mdata_vendor_id === "string" ? metadata.mdata_vendor_id : null,
    async function assertMdataVendorExists() {}
    SELECT id FROM mdata.vendors WHERE id = $1
  `;
  const goodPage = `listVendors mdata_vendor_id AP Vendor`;
  const goodApi = `mdata_vendor_id: string | null`;
  const goodDetail = `vendor.mdata_vendor_id`;

  const checks = [
    ["good wiring passes", checkLinkage(goodRoutes, goodPage, goodApi, goodDetail).length === 0],
    ["missing schema field caught", checkLinkage("", goodPage, goodApi, goodDetail).length > 0],
    ["missing FE picker caught", checkLinkage(goodRoutes, "", goodApi, goodDetail).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:maint-wo-vendor-linkage --selftest FAIL");
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`verify:maint-wo-vendor-linkage --selftest PASS (${checks.length} checks)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:maint-wo-vendor-linkage FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("verify:maint-wo-vendor-linkage PASS");
}
