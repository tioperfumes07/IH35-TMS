#!/usr/bin/env node
/**
 * INV-LINK-01 — Part → vendor linkage on inventory create/edit + backend persistence.
 *
 *   node scripts/verify-inv-link-01-part-vendor.mjs
 *   node scripts/verify-inv-link-01-part-vendor.mjs --selftest
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LABEL = "verify-inv-link-01-part-vendor";
const SELFTEST = process.argv.includes("--selftest");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

export function verifyInvLink01PartVendor(root = ROOT, overrides = {}) {
  const errs = [];
  const create = read("apps/frontend/src/pages/inventory/PartCreateDrawer.tsx");
  const edit = read("apps/frontend/src/pages/inventory/PartEditDrawer.tsx");
  const stock = read("apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx");
  const routes = overrides.routes ?? read("apps/backend/src/maintenance/parts.routes.ts");
  const inventoryRoutes = overrides.inventoryRoutes ?? read("apps/backend/src/maintenance/parts-inventory.routes.ts");

  if (!existsSync(join(root, "apps/frontend/src/pages/inventory/PartEditDrawer.tsx"))) {
    errs.push("missing PartEditDrawer.tsx");
  }

  for (const [name, src] of [
    ["PartCreateDrawer", create],
    ["PartEditDrawer", edit],
  ]) {
    if (!/vendor_id/.test(src)) errs.push(`${name}: must wire vendor_id`);
    if (!/ReferenceSelect/.test(src)) errs.push(`${name}: must use ReferenceSelect vendor picker`);
    if (!/createKind\s*=\s*["']vendor["']/.test(src)) errs.push(`${name}: ReferenceSelect createKind="vendor"`);
    if (!/updateMaintenancePart|vendor_id:/.test(src) && name === "PartEditDrawer") {
      errs.push("PartEditDrawer: must PATCH vendor_id via updateMaintenancePart");
    }
  }

  if (!/vendor_id/.test(create) || !/vendor_id:/.test(create)) {
    errs.push("PartCreateDrawer: must POST vendor_id on create body");
  }

  if (!/EntityLink/.test(stock) || !/kind\s*=\s*["']vendor["']/.test(stock)) {
    errs.push("InventoryPartsStockPage: roster must render EntityLink kind=vendor");
  }
  if (!/PartEditDrawer/.test(stock)) errs.push("InventoryPartsStockPage: must mount PartEditDrawer");
  if (/\blistVendors\b/.test(stock)) {
    errs.push("InventoryPartsStockPage: must not enrich vendor labels via listVendors (use API vendor_name)");
  }
  if (!/vendor_name/.test(stock) || !/mapMaintenancePartsToInventoryRows/.test(stock)) {
    errs.push("InventoryPartsStockPage: must map vendor_label from API vendor_name");
  }

  if (!/vendor_id::text AS vendor_id/.test(routes)) {
    errs.push("parts.routes GET must SELECT vendor_id (not hardcoded null vendor_default)");
  }
  if (!/v\.vendor_name AS vendor_name/.test(routes) || !/LEFT JOIN mdata\.vendors v/.test(routes)) {
    errs.push("parts.routes GET must LEFT JOIN mdata.vendors.vendor_name (same-opco) AS vendor_name");
  }
  if (!/v\.operating_company_id = pi\.operating_company_id/.test(routes)) {
    errs.push("parts.routes vendor join must be entity-scoped (pi.operating_company_id)");
  }
  if (/NULL::text AS vendor_default/.test(routes)) {
    errs.push("parts.routes must not hardcode NULL::text AS vendor_default on read");
  }
  if (!/vendor_id/.test(routes.match(/INSERT INTO maintenance\.parts_inventory[\s\S]*?RETURNING/)?.[0] ?? "")) {
    errs.push("parts.routes INSERT must persist vendor_id");
  }
  if (!/add\("vendor_id"/.test(routes)) {
    errs.push("parts.routes PATCH must update vendor_id");
  }
  if (/vendor_default:\s*null/.test(routes)) {
    errs.push("parts.routes must not hardcode vendor_default: null on update response");
  }
  if (!/v\.vendor_name AS vendor_name/.test(inventoryRoutes)) {
    errs.push("parts-inventory.routes GET must select the real mdata.vendors.vendor_name column");
  }
  if (/\bv\.name\s+AS\s+vendor_name\b/.test(`${routes}\n${inventoryRoutes}`)) {
    errs.push("inventory routes must not query phantom mdata.vendors.name");
  }

  return errs;
}

if (SELFTEST) {
  const errs = verifyInvLink01PartVendor();
  if (errs.length) {
    console.error(`${LABEL} --selftest FAIL:`, errs);
    process.exit(1);
  }
  const goodRoutes = read("apps/backend/src/maintenance/parts.routes.ts");
  const goodInventoryRoutes = read("apps/backend/src/maintenance/parts-inventory.routes.ts");
  const planted = verifyInvLink01PartVendor(ROOT, {
    routes: goodRoutes.replace(/v\.vendor_name AS vendor_name/, "v.name AS vendor_name"),
    inventoryRoutes: goodInventoryRoutes.replace(/v\.vendor_name AS vendor_name/, "v.name AS vendor_name"),
  });
  if (!planted.some((error) => error.includes("phantom mdata.vendors.name"))) {
    console.error(`${LABEL} --selftest FAIL: planted phantom vendor column escaped`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
} else {
  const errs = verifyInvLink01PartVendor();
  if (errs.length) {
    console.error(`${LABEL} FAIL`);
    for (const e of errs) console.error(" -", e);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
