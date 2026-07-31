#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mig = readFileSync(resolve(ROOT, "db/migrations/202611031200_lease_bridge_rent_expense_coa_role.sql"), "utf8");
for (const tok of ["broker_customer_advance_liability", "rent_expense", "heavy_repair_expense"]) {
  if (!mig.includes(tok)) {
    console.error("FAIL verify-lease-bridge-coa-keeps-broker-role — missing", tok);
    process.exit(1);
  }
}
const iBroker = mig.indexOf("broker_customer_advance_liability");
const iRent = mig.indexOf("'rent_expense'");
if (iBroker < 0 || iRent < 0 || iBroker > iRent) {
  console.error("FAIL — broker_customer_advance_liability must precede rent_expense in CHECK");
  process.exit(1);
}
console.log("PASS verify-lease-bridge-coa-keeps-broker-role");
