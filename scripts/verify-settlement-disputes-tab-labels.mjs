#!/usr/bin/env node
/**
 * Static guard: SettlementDisputesTab must not expose raw UUIDs or ISO dates as
 * user-facing labels. Backend must resolve settlement_display_id + driver_name.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tabFile = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "apps/backend/src/driver-finance/settlement-dispute.service.ts"), "utf8");
const errors = [];

if (!/settlement_display_id/.test(backend)) {
  errors.push("Backend settlement dispute queries do not return settlement_display_id");
}
if (!/driver_name/.test(backend)) {
  errors.push("Backend settlement dispute queries do not return driver_name");
}
if (/\.slice\(0,\s*8\)/.test(tabFile)) {
  errors.push("SettlementDisputesTab renders raw UUID fragments");
}
if (/entity_id/.test(tabFile)) {
  errors.push("SettlementDisputesTab uses raw entity_id as a label");
}
if (!/formatDateUS\(row\.period_start\)/.test(tabFile) || !/formatDateUS\(row\.period_end\)/.test(tabFile)) {
  errors.push("SettlementDisputesTab does not format period dates with formatDateUS");
}
if (!/entityLabel/.test(tabFile)) {
  errors.push("SettlementDisputesTab settlement link does not use entityLabel helper");
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: SettlementDisputesTab uses human-readable labels and formatted dates");
process.exit(0);
