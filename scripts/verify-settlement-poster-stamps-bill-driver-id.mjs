#!/usr/bin/env node
// INV-01 (CC-1 CURRENT ASSIGNMENT, 2026-09-07): settlement-bill-payment-posting.service.ts's
// createBill() call is unambiguously a driver-pay bill (settlement.driver_id is in scope the
// whole function) but never passed createBill's driverId param, so accounting.bills.driver_id
// stayed NULL on every driver-pay bill this poster ever created -- the one column that exists
// specifically so a driver-pay bill can be found by driver (bills.service.ts's own
// `if (input.driverId && presentCols.has("driver_id"))` stamp gate, GO-18). Static guard: asserts
// the createBill call passes driverId: settlement.driver_id.
import fs from "node:fs";

const LABEL = "verify-settlement-poster-stamps-bill-driver-id";
const FILE = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";

export function posterStampsDriverId(src) {
  const callMatch = src.match(/const bill = await createBill\(\s*\{([\s\S]*?)\},\s*actor\.userId\s*\)/);
  if (!callMatch) return false;
  return /driverId:\s*settlement\.driver_id/.test(callMatch[1]);
}

function check(src) {
  if (!posterStampsDriverId(src)) {
    throw new Error(
      "settlement-bill-payment-posting.service.ts's createBill() call no longer stamps driverId: settlement.driver_id -- " +
        "accounting.bills.driver_id would go back to NULL on every driver-pay bill this poster creates (INV-01)."
    );
  }
}

const src = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    src.replace("driverId: settlement.driver_id,\n          //", "//"),
    src.replace(/const bill = await createBill\(/, "const bill = await createBillRenamed("),
  ];
  for (const mutated of mutations) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error("a mutation escaped detection");
  }
  check(src);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(src);
  console.log(`${LABEL} PASS -- the settlement poster's createBill() call stamps driverId, so accounting.bills.driver_id is populated for driver-pay bills`);
}
