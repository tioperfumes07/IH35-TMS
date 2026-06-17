#!/usr/bin/env node
/**
 * verify-cash-forecast-opening-excludes-credit.mjs (CASH-ANOMALY)
 * The cash-forecast opening balance must sum CASH (depository) accounts only — credit
 * cards / lines of credit carry debt and must be excluded, or opening cash goes negative
 * (the -$5.5M anomaly). Guards against regression.
 */
import fs from "node:fs";
import path from "node:path";
const src = fs.readFileSync(path.join(process.cwd(), "apps/backend/src/accounting/cash-forecast.routes.ts"), "utf8");
// The opening-cash SUM(current_balance_cents) on banking.bank_accounts must exclude
// credit account types before the query string closes.
if (!/SUM\(current_balance_cents\)[\s\S]{0,800}NOT ILIKE\s*'%credit%'/i.test(src)) {
  console.error("verify-cash-forecast-opening-excludes-credit FAIL: opening-cash SUM(current_balance_cents) must exclude credit account_type (NOT ILIKE '%credit%').");
  process.exit(1);
}
console.log("verify-cash-forecast-opening-excludes-credit OK — opening cash excludes credit accounts.");
