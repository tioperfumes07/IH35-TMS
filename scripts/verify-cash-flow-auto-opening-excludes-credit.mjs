#!/usr/bin/env node
// Guard (CASH-ANOMALY, auto projection): the daily-prediction opening-cash sum must
// exclude credit-card / line-of-credit (and other non-cash) accounts — their balances are
// debt, not cash; counting them dragged opening cash negative.
// REALIGNED #1159: the prior implementation re-summed banking.bank_transactions with
// `CASE WHEN t.is_credit THEN amount_cents ELSE -amount_cents` and merely excluded
// `NOT ILIKE '%credit%'`. That re-sum mis-signed Plaid's SIGNED amount_cents and produced a
// phantom -$4.79M. The invariant is now STRONGER and correct: opening cash reads the
// authoritative reconciled depository balances (current_balance_cents on
// account_class='depository'), which by definition excludes credit/investment/virtual debt.
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const failures = [];

let src = "";
try {
  src = readFileSync(FILE, "utf8");
} catch {
  failures.push(`${FILE}: missing`);
}

if (src) {
  // Anchor on the opening-cash query (reads bank_accounts.current_balance_cents).
  const idx = src.indexOf("const openingRow");
  const end = src.indexOf("const openingCashCents");
  const window = idx >= 0 && end > idx ? src.slice(idx, end) : "";
  if (!window) {
    failures.push(`${FILE}: openingRow query block not found`);
  }
  if (!/SUM\(current_balance_cents\)/.test(window)) {
    failures.push(`${FILE}: opening-cash must SUM reconciled current_balance_cents (not a bank_transactions re-sum)`);
  }
  if (!/account_class = 'depository'/.test(window)) {
    failures.push(`${FILE}: opening-cash must restrict to account_class='depository' (excludes credit/investment/virtual debt)`);
  }
  // The mis-signing re-sum must never come back.
  if (/CASE WHEN t\.is_credit THEN[\s\S]*amount_cents ELSE/.test(window)) {
    failures.push(`${FILE}: must NOT re-sum banking.bank_transactions with the signed-amount CASE WHEN is_credit formula`);
  }
}

if (failures.length) {
  console.error("verify:cash-flow-auto-opening-excludes-credit — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:cash-flow-auto-opening-excludes-credit — OK (auto opening cash excludes credit accounts)");
