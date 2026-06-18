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

// Deposits must be the money-IN side (amount_cents < 0).
if (!/CASE WHEN bt\.amount_cents < 0 THEN abs\(bt\.amount_cents\)[^\n]*AS deposits/.test(src)) {
  fail("Deposits must be amount_cents < 0 (money in) — the SIGNED-convention deposit side");
}
// Withdrawals must be the money-OUT side (amount_cents > 0).
if (!/CASE WHEN bt\.amount_cents > 0 THEN bt\.amount_cents[^\n]*AS withdrawals/.test(src)) {
  fail("Withdrawals must be amount_cents > 0 (money out)");
}
// The swapped mapping (amount_cents >= 0 -> deposits) must never return.
if (/amount_cents >= 0 THEN[^\n]*AS deposits/.test(src)) {
  fail("the SWAPPED mapping (amount_cents >= 0 -> deposits) must not reappear");
}

console.log("PASS verify-bank-register-sign");
