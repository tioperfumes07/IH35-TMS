#!/usr/bin/env node
// Factoring GL poster contract guard — SECURED-BORROWING model (ASC 860).
//
// PR #1770 (merged, Jorge-approved) re-architected the factoring poster from the
// SALE model to SECURED BORROWING. The old sale-model contract this guard used to
// assert — resolveAccountForCategory(..., 'factoring_fee', 'default'),
// source_transaction_type:"customer_payment", postSourceTransaction( — was the
// exact defect the rewrite removed. This guard now asserts the NEW contract and
// asserts the ABSENCE of the sale-model artifacts. (It was never enforcing on the
// new code because the arch-design runner poison-pill kept it from ever running.)
//
// Contract asserted against factoring-posting/poster.service.ts:
//   * resolves every account via the entity-pinned COA role resolver
//     (resolveRoleAccount from ../coa-roles/resolver.service.js), incl. the
//     factoring roles factor_fee_expense and factoring_advance_liability;
//   * routes every entry through createJournalEntry (double-entry trigger tables);
//   * does NOT use the sale-model posting-engine customer_payment source, and does
//     NOT net via postSourceTransaction / resolveAccountForCategory.
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/factoring-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:factoring-posting-uses-resolver-and-roles — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/factoring-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");

  // NEW contract: entity-pinned COA role resolver for factoring accounts.
  if (!/from "\.\.\/coa-roles\/resolver\.service\.js"/.test(source) || !/resolveRoleAccount\(/.test(source)) {
    failures.push("factoring poster must resolve accounts via the entity COA role resolver (resolveRoleAccount from ../coa-roles/resolver.service.js)");
  }
  if (!/resolveRoleAccount\([^)]*"factor_fee_expense"\s*\)/.test(source)) {
    failures.push('factoring poster must resolve the "factor_fee_expense" role');
  }
  if (!/resolveRoleAccount\([^)]*"factoring_advance_liability"\s*\)/.test(source)) {
    failures.push('factoring poster must resolve the "factoring_advance_liability" role (secured-borrowing liability)');
  }
  // Every entry routed through the double-entry JE builder.
  if (!/from "\.\.\/journal-entries\.service\.js"/.test(source) || !/createJournalEntry\(/.test(source)) {
    failures.push("factoring poster must post via createJournalEntry (accounting.journal_entries double-entry tables)");
  }

  // ABSENCE of the removed sale-model defect artifacts.
  if (/source_transaction_type:\s*"customer_payment"/.test(source)) {
    failures.push('factoring poster must NOT use the sale-model source_transaction_type:"customer_payment" (removed by the secured-borrowing rewrite)');
  }
  if (/\bpostSourceTransaction\(/.test(source)) {
    failures.push("factoring poster must NOT hook through the sale-model postSourceTransaction( backbone");
  }
  if (/\bresolveAccountForCategory\(/.test(source)) {
    failures.push("factoring poster must NOT use the sale-model resolveAccountForCategory( expense-category mapping");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:factoring-posting-uses-resolver-and-roles — OK");
