#!/usr/bin/env node
/**
 * verify-projected-cash-date-equals-delivery
 *
 * Owner ruling 2026-09-28, verbatim: "THE PROJECTIONS ARE ON THE PROJECTED PURCHASES OF INVOICES
 * BY FARO. THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME DATE." and "I AM TELLING YOU HOW
 * CASH FLOW WORKS, THAT IS THE CODE."
 *
 * This supersedes the 2026-06-17 rule that asserted the receivable lag is never zero. That rule
 * added +1 day for every factoring_eligible customer (1,236 of 1,248 live), so the 9 loads
 * delivering 2026-09-28 ($40,575.00) bucketed onto 2026-09-29 and the cash-flow screen was empty
 * for today.
 *
 * Asserts, statically, that the lag constants and the rule function are zero. A non-zero value
 * silently shifts every projected dollar by a day, which is exactly the defect class this guard
 * exists to stop: a number-shaped thing on screen that came from a formula nobody re-read.
 */
import { FACTORING_ADVANCE_DAYS, DEFAULT_NET_TERMS_DAYS, receivableLagDays, projectedCashDate }
  from "../apps/backend/dist/dispatch/receivable-lag.js";

const failures = [];

if (FACTORING_ADVANCE_DAYS !== 0) {
  failures.push(`FACTORING_ADVANCE_DAYS is ${FACTORING_ADVANCE_DAYS}, must be 0 (owner 2026-09-28)`);
}
if (DEFAULT_NET_TERMS_DAYS !== 0) {
  failures.push(`DEFAULT_NET_TERMS_DAYS is ${DEFAULT_NET_TERMS_DAYS}, must be 0 (owner 2026-09-28)`);
}

for (const is_factored of [true, false]) {
  for (const customer_net_days of [null, 0, 1, 21, 30, 45, 90]) {
    const lag = receivableLagDays({ is_factored, customer_net_days });
    if (lag !== 0) {
      failures.push(`receivableLagDays({is_factored:${is_factored},customer_net_days:${customer_net_days}}) = ${lag}, must be 0`);
    }
  }
}

const delivery = "2026-09-28T00:00:00.000Z";
const projected = projectedCashDate(delivery, receivableLagDays({ is_factored: true, customer_net_days: null }));
if (projected !== delivery) {
  failures.push(`projectedCashDate(${delivery}) = ${projected}, must equal the delivery date itself`);
}

if (failures.length > 0) {
  console.error("FAIL verify-projected-cash-date-equals-delivery");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nThe delivery date IS the projected income date. Do not re-introduce a lag.");
  process.exit(1);
}

console.log("PASS verify-projected-cash-date-equals-delivery");
console.log("  FACTORING_ADVANCE_DAYS = 0, DEFAULT_NET_TERMS_DAYS = 0");
console.log("  receivableLagDays() = 0 for all 14 input combinations");
console.log(`  projectedCashDate(${delivery}) = ${projected}`);
process.exit(0);
