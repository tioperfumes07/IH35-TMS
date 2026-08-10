#!/usr/bin/env node
/**
 * LV-BILLS-VENDOR-UUID: the Bills list must resolve vendor ids to vendor names for both QBO-origin
 * (text qbo_entity_id) and TMS-native (mdata.vendors UUID) bills. This guard statically asserts that
 * the resolution path in bills.service.ts falls back to mdata.vendors for UUID-shaped vendor ids.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/accounting/bills.service.ts");
const SELFTEST = process.argv.includes("--selftest");

function fail(msg) {
  console.error(`[verify-bills-list-vendor-name-resolved] ${msg}`);
  process.exit(1);
}

function run() {
  const src = fs.readFileSync(FILE, "utf8");

  const checks = [
    ["resolveVendorDisplayMap exists", /export async function resolveVendorDisplayMap\b/.test(src)],
    ["qbo_archive.entities_snapshot primary lookup", /qbo_archive\.entities_snapshot/.test(src)],
    ["mdata.vendors fallback for UUID ids", /mdata\.vendors/.test(src) && /UUID_SHAPE_RE/.test(src)],
    ["listAllBillsForCompany maps vendor_name", /listAllBillsForCompany[\s\S]{0,1200}?vendor_name:\s*r\.vendor_id\s*\?\s*vendorNames\[r\.vendor_id\]/.test(src)],
    ["listBills vendor-filter path also resolves", /listBills[\s\S]{0,1200}?vendor_name:\s*r\.vendor_id\s*\?\s*vendorNames\[r\.vendor_id\]/.test(src)],
  ];

  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    fail(`bills.service.ts vendor-name resolution incomplete: ${missing.join(", ")}`);
  }
  return { ok: true, message: "bills.service.ts resolves vendor names for QBO and mdata UUID vendor ids" };
}

if (SELFTEST) {
  const { ok, message } = run();
  console.log(`verify-bills-list-vendor-name-resolved --selftest ${ok ? "PASS" : "FAIL"}: ${message}`);
  process.exit(ok ? 0 : 1);
}

const { ok, message } = run();
console.log(`verify-bills-list-vendor-name-resolved OK — ${message}`);
process.exit(ok ? 0 : 1);
