#!/usr/bin/env node
/**
 * Bill payments list pay-bill picker must load open bills via has_balance (includes partial),
 * not legacy status=unpaid pseudo-status.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = fs.readFileSync(
  path.join(root, "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx"),
  "utf8"
);

const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

if (page.includes('status: "unpaid"') || page.includes("status: 'unpaid'")) {
  fail("BillPaymentsListPage must not list bills with status=unpaid");
}
if (!page.includes("has_balance: true")) {
  fail("BillPaymentsListPage bills query must pass has_balance: true");
}

// QUERY-KEY COHERENCE — the defect this guard originally missed.
// The picker's queryKey was renamed to "bills-has-balance" while all three invalidateQueries calls
// still said "bills-unpaid". React Query cannot match mismatched keys, so the picker never
// refetched after a payment; with staleTime 30s and refetchOnWindowFocus false there was no
// recovery path, and a bill just paid IN FULL stayed in the pay picker at its old open balance.
// That is a double-pay path, so key coherence is now part of the contract.
const KEY = '["accounting", "bills-has-balance", companyId]';
if (page.includes('"bills-unpaid"')) {
  fail('BillPaymentsListPage still references the stale "bills-unpaid" query key — picker key and every invalidateQueries must match, or the paid bill stays payable');
}
const keyUses = page.split(KEY).length - 1;
if (keyUses < 4) {
  fail(`BillPaymentsListPage must use ${KEY} for the picker query AND all three invalidateQueries calls (found ${keyUses} of 4)`);
}

console.log("PASS: verify-acct-bill-payments-has-balance");
