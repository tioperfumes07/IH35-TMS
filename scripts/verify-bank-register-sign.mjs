#!/usr/bin/env node
// Guard (CASH-INTEGRITY): the bank register's Deposits/Withdrawals columns must match the SIGNED
// amount_cents convention (Plaid: NEGATIVE = money IN = deposit; POSITIVE = money OUT = withdrawal).
// The register previously mapped amount_cents>=0 -> deposits, which SWAPPED the columns (a deposit
// displayed under Withdrawals). Lock the corrected mapping so it can't flip back.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-bank-register-sign: ${m}`); process.exit(1); };
const src = readFileSync(join(root, "apps/backend/src/banking/banking.routes.ts"), "utf8");

// Deposits must be the money-IN side — either signed (amount_cents < 0) or is_credit flag.
if (!/CASE WHEN bt\.amount_cents < 0 THEN abs\(bt\.amount_cents\)[^\n]*AS deposits/.test(src) &&
    !/CASE WHEN bt\.is_credit THEN abs\(bt\.amount_cents\)[^\n]*AS deposits/.test(src)) {
  fail("Deposits must be amount_cents < 0 (money in) — the SIGNED-convention deposit side");
}
// Withdrawals must be the money-OUT side — either signed (amount_cents > 0) or NOT is_credit flag.
if (!/CASE WHEN bt\.amount_cents > 0 THEN bt\.amount_cents[^\n]*AS withdrawals/.test(src) &&
    !/CASE WHEN NOT bt\.is_credit THEN abs\(bt\.amount_cents\)[^\n]*AS withdrawals/.test(src)) {
  fail("Withdrawals must be amount_cents > 0 (money out)");
}
// The swapped mapping (amount_cents >= 0 -> deposits) must never return.
if (/amount_cents >= 0 THEN[^\n]*AS deposits/.test(src)) {
  fail("the SWAPPED mapping (amount_cents >= 0 -> deposits) must not reappear");
}

const plaidSrc = readFileSync(join(root, "apps/backend/src/integrations/plaid/plaid.service.ts"), "utf8");
if (!/export function plaidAmountToStatementCents/.test(plaidSrc) || !/amount_cents: -plaidCents/.test(plaidSrc)) {
  fail("Plaid sync must store statement-signed cents (negate Plaid amount) via plaidAmountToStatementCents");
}
if (/toCents\(transaction\.amount\)/.test(plaidSrc)) {
  fail("Plaid sync must not write raw toCents(transaction.amount) — use plaidAmountToStatementCents");
}
const viewSrc = readFileSync(join(root, "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"), "utf8");
if (/tx\.is_credit \|\| Number\(tx\.amount_cents/.test(viewSrc)) {
  fail("spentReceived/from-to must not treat negative amount_cents as money-in (BofA outflows are negative)");
}
if (!/\{ id: "all", label: "All" \}/.test(viewSrc) || !/useState<ReviewTabId>\("all"\)/.test(viewSrc)) {
  fail("register default must be All so categorized rows (e.g. 12/08 $100) stay on the statement walk");
}
if (!/key: "date"[\s\S]{0,220}cellClass: "whitespace-nowrap"/.test(viewSrc)) {
  fail("Date column must whitespace-nowrap so 09/09/2026 is not ellipsized to 09/09...");
}
if (!/export async function applyPostedSignedCurrentBalance/.test(plaidSrc)) {
  fail("Plaid must re-anchor current_balance_cents from posted signed SUM, not leave Plaid's snapshot");
}

console.log("PASS verify-bank-register-sign");
