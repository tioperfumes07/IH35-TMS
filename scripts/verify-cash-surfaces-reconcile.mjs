#!/usr/bin/env node
// Guard (CASH-INTEGRITY): all cash surfaces must read ONE authoritative helper —
// sumAuthoritativeDepositoryCashCents — so KPI total_cash, cash-flow opening, and accounts/all agree.
//
// History: the cash-flow opening re-summed bank_transactions with CASE WHEN is_credit THEN
// amount_cents ELSE -amount_cents across the Plaid-mixed population, but amount_cents is stored
// SIGNED (Plaid), so the sum collapsed to -(gross volume) → a phantom -$4,789,956 opening. And the
// banking KPI total_cash read a tile view that returned 0 while accounts/all showed real cash.
//
// RELAY-WALLET-BALANCE-1: non-Plaid internal wallets (plaid_item_id IS NULL) keep frozen
// current_balance_cents=0; their contribution is an is_credit-keyed ledger sum INSIDE the shared
// helper only (never inline in cash-flow / KPI). Plaid accounts stay on SUM(current_balance_cents).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-cash-surfaces-reconcile: ${m}`); process.exit(1); };
const read = (p) => readFileSync(join(root, p), "utf8");

const DEPOSITORY_SUM = /SUM\(current_balance_cents\)[\s\S]*?account_class = 'depository'/;

const helper = read("apps/backend/src/banking/internal-wallet-balance.ts");
if (!/export async function sumAuthoritativeDepositoryCashCents/.test(helper)) {
  fail("internal-wallet-balance.ts must export sumAuthoritativeDepositoryCashCents");
}
if (!DEPOSITORY_SUM.test(helper)) {
  fail("helper must SUM(current_balance_cents) on account_class='depository' for Plaid accounts");
}
if (!/plaid_item_id IS NOT NULL/.test(helper)) {
  fail("helper Plaid branch must restrict to plaid_item_id IS NOT NULL");
}
if (!/plaid_item_id IS NULL/.test(helper) || !/CASE WHEN bt\.is_credit THEN bt\.amount_cents ELSE -bt\.amount_cents/.test(helper)) {
  fail("helper must derive non-Plaid wallets via is_credit-keyed bank_transactions sum (plaid_item_id IS NULL)");
}

// Cash-flow opening must call the shared helper — never inline a bank_transactions re-sum.
const svc = read("apps/backend/src/cash-flow/cash-flow.service.ts");
if (!/sumAuthoritativeDepositoryCashCents\s*\(/.test(svc)) {
  fail("cash-flow opening must call sumAuthoritativeDepositoryCashCents (same total as Banking KPI)");
}
const openingRegion = svc.slice(
  svc.indexOf("Opening cash"),
  svc.indexOf("projectedClosingCents") > 0 ? svc.indexOf("projectedClosingCents") : svc.length,
);
if (/FROM banking\.bank_transactions/.test(openingRegion)) {
  fail("cash-flow opening must NOT inline banking.bank_transactions (use shared helper only)");
}

// Banking KPI must call the same helper and still surface authoritativeTotalCash.
const bank = read("apps/backend/src/banking/banking.routes.ts");
if (!/sumAuthoritativeDepositoryCashCents\s*\(/.test(bank)) {
  fail("banking KPI total_cash must call sumAuthoritativeDepositoryCashCents");
}
if (!/total_cash: authoritativeTotalCash/.test(bank)) {
  fail("KPI payload must override total_cash with the authoritative depository sum");
}

console.log("PASS verify-cash-surfaces-reconcile");
