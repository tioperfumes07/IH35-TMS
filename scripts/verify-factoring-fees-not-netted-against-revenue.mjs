#!/usr/bin/env node
// Factoring fee treatment guard — fee is a positive EXPENSE DEBIT, NEVER netted
// against revenue or A/R.
//
// PR #1770 (merged, Jorge-approved) MOVED fee posting out of
// factoring-fees-posting/poster.service.ts (now a documented no-op) INTO the
// FUNDING entry in factoring-posting/poster.service.ts, where the fee is booked as
// a positive DEBIT to the factor_fee_expense role (Dr Factoring Fees / Cr Factoring
// Advance liability) — never a credit to revenue/A/R. This guard is repointed to
// assert that new location. (It was never enforcing on the new code because the
// arch-design runner poison-pill kept it from ever running.)
//
// Intent preserved verbatim: the factoring fee must NOT be netted against revenue.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/factoring-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:factoring-fees-not-netted-against-revenue — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/factoring-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");

  // Fee expense account resolves via the entity COA role resolver to factor_fee_expense.
  if (!/feeAccountId\s*=\s*await\s+resolveRoleAccount\([^)]*"factor_fee_expense"\s*\)/.test(source)) {
    failures.push('factoring fee must resolve the "factor_fee_expense" role via resolveRoleAccount (feeAccountId)');
  }
  // Fee is posted as a positive DEBIT to that expense account.
  if (!/account_id:\s*feeAccountId,\s*debit_or_credit:\s*"debit"/.test(source)) {
    failures.push("factoring fee amount must be posted as a positive expense DEBIT to factor_fee_expense (VQ6)");
  }
  // The fee expense account must NEVER be posted as a credit (would net it away).
  if (/account_id:\s*feeAccountId,\s*debit_or_credit:\s*"credit"/.test(source)) {
    failures.push("factoring fee expense account must never be posted as a credit");
  }
  // No revenue account may appear in the factoring poster — the fee must not be
  // netted against revenue (nor may any funding leg credit revenue).
  if (/revenue/i.test(source)) {
    failures.push("factoring poster must not reference any revenue account (fee must not be netted against revenue)");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:factoring-fees-not-netted-against-revenue — OK");
