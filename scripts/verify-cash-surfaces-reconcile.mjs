#!/usr/bin/env node
// Guard (CASH-INTEGRITY): all cash surfaces must read the ONE authoritative source —
// banking.bank_accounts.current_balance_cents on account_class='depository' — so they reconcile.
// History: the cash-flow opening re-summed bank_transactions with CASE WHEN is_credit THEN
// amount_cents ELSE -amount_cents, but amount_cents is stored SIGNED (Plaid), so the sum collapsed to
// -(gross volume) → a phantom -$4,789,956 opening. And the banking KPI total_cash read a tile view that
// returned 0 while accounts/all showed real cash. This guard prevents regressing to either: the
// opening-cash query and the KPI total_cash query must both sum current_balance_cents on depository
// accounts, and the cash-flow opening must NOT re-sum bank_transactions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-cash-surfaces-reconcile: ${m}`); process.exit(1); };
const read = (p) => readFileSync(join(root, p), "utf8");

const DEPOSITORY_SUM = /SUM\(current_balance_cents\)[\s\S]*?account_class = 'depository'/;

// 1) Cash-flow opening reads the authoritative depository balance, NOT a bank_transactions re-sum.
const svc = read("apps/backend/src/cash-flow/cash-flow.service.ts");
const openingBlock = svc.slice(svc.indexOf("const openingRow"), svc.indexOf("const openingCashCents"));
if (!openingBlock) fail("openingRow block not found in cash-flow.service.ts");
if (!DEPOSITORY_SUM.test(openingBlock)) fail("opening cash must SUM(current_balance_cents) on account_class='depository'");
if (/FROM banking\.bank_transactions/.test(openingBlock)) {
  fail("opening cash must NOT re-sum banking.bank_transactions (signed-amount bug → phantom -$4.79M)");
}
if (/is_credit THEN[\s\S]*amount_cents ELSE/.test(openingBlock)) {
  fail("the signed-amount CASE WHEN is_credit formula must not be used for opening cash");
}

// 2) Banking KPI total_cash reads the same authoritative depository source.
const bank = read("apps/backend/src/banking/banking.routes.ts");
if (!DEPOSITORY_SUM.test(bank)) fail("banking KPI total_cash must SUM(current_balance_cents) on account_class='depository'");
if (!/total_cash: authoritativeTotalCash/.test(bank)) fail("KPI payload must override total_cash with the authoritative depository sum");

console.log("PASS verify-cash-surfaces-reconcile");
