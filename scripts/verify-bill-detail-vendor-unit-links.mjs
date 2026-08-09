#!/usr/bin/env node
/**
 * Static guard: BillDetailPage must use EntityLink for vendor + unit hops,
 * and the unit link must prefer a human-readable display id over a UUID slice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const detailPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/BillDetailPage.tsx"), "utf8");
const apiTypes = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/accounting.ts"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "apps/backend/src/accounting/bills.service.ts"), "utf8");
const errors = [];

if (!/billVendorDrillId/.test(detailPage)) {
  errors.push("BillDetailPage does not use billVendorDrillId for vendor drill-through");
}
if (!/kind="vendor"/.test(detailPage)) {
  errors.push("BillDetailPage missing vendor EntityLink");
}
if (!/kind="unit"/.test(detailPage)) {
  errors.push("BillDetailPage missing unit EntityLink");
}
if (!/unit_display_id/.test(apiTypes)) {
  errors.push("BillDetail type missing unit_display_id");
}
if (!/unit_display_id/.test(backend)) {
  errors.push("Backend bill detail query does not return unit_display_id");
}
if (!/u\.unit_number AS unit_display_id/.test(backend)) {
  errors.push("Backend does not join mdata.units.unit_number as unit_display_id");
}
if (!/bill\.unit_display_id\s*\?\?\s*bill\.unit_id\.slice\(0,\s*8\)/.test(detailPage)) {
  errors.push("BillDetailPage unit label does not prefer unit_display_id with UUID fallback");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: Bill detail vendor + unit links use EntityLink with human-readable unit label");
process.exit(0);
