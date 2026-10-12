#!/usr/bin/env node
/**
 * Lead ruling 2026-10-01 17:20Z — Finish reconcile posts:
 *   - service charge through the EXPENSE engine (createAndPostServiceChargeExpense)
 *   - interest earned through createJournalEntryOnClient (income, not a cost)
 *
 * Static: migration expense FK; poster creates expense + posts; complete route stores expense id;
 * costs-guard does NOT exempt bank_reconciliation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recon-service-charge-interest-posts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  const migLegacy = read("db/migrations/202615141200_recon_session_service_charge_interest.sql");
  assert.match(migLegacy, /service_charge_cents/);
  assert.match(migLegacy, /interest_earned_cents/);
  assert.match(migLegacy, /service_charge_journal_entry_id/);
  assert.match(migLegacy, /interest_earned_journal_entry_id/);

  const migExpense = read("db/migrations/202610011900_recon_service_charge_expense_fk.sql");
  assert.match(migExpense, /service_charge_expense_id/);
  assert.match(migExpense, /ADD COLUMN IF NOT EXISTS/);
  assert.match(migExpense, /accounting\.expenses/);

  const poster = read("apps/backend/src/banking/recon-adjustments.service.ts");
  assert.match(poster, /createAndPostServiceChargeExpense/);
  // ROUND 441.5 (#25762, 84a705420b): the service charge posts through the ONE bank-line expense writer the categorize
  // poster uses. The expense-engine assertions follow the code there; the poster must hand it the bank (paid from),
  // the service-charge account and the item.
  assert.match(poster, /import \{ createAndPostBankLineExpenseOnClient \} from "\.\.\/accounting\/bank-line-expense\.service\.js"/);
  assert.match(poster, /await createAndPostBankLineExpenseOnClient\(/);
  assert.match(poster, /paymentAccountId: input\.bank_ledger_account_id/);
  assert.match(poster, /expenseAccountId: input\.service_charge_account_id/);
  assert.match(poster, /itemId,/);
  const writer = read("apps/backend/src/accounting/bank-line-expense.service.ts");
  assert.match(writer, /postSourceTransactionInClientTx/);
  assert.match(writer, /source_transaction_type: "expense"/);
  assert.match(writer, /is_company_expense/);
  assert.match(writer, /payment_account_uuid/);
  assert.match(writer, /unit_of_measure/);
  assert.match(writer, /'each'/);
  assert.match(poster, /createJournalEntryOnClient/); // interest still income JE (not a 5xxx/6xxx cost)
  assert.match(poster, /Interest earned/);
  // SC must not mint a bare cost JE: only one createJournalEntryOnClient *call* (interest).
  const jeCallSites = [...poster.matchAll(/await createJournalEntryOnClient\s*\(/g)];
  assert.equal(jeCallSites.length, 1, "exactly one await createJournalEntryOnClient (interest); SC uses expense engine");
  assert.match(poster, /item_id/);

  const routes = read("apps/backend/src/banking/reconciliation.routes.ts");
  assert.match(routes, /postReconciliationAdjustments/);
  assert.match(routes, /service_charge_expense_id/);
  assert.match(routes, /bank_account_id: session\.bank_account_id/);

  const costsGuard = read("scripts/verify-costs-are-expenses-not-handwritten-jes.mjs");
  assert.doesNotMatch(costsGuard, /"bank_reconciliation"/);

  const adjusted = read("apps/backend/src/banking/adjusted-balance-rec.ts");
  assert.match(adjusted, /serviceChargeCents/);
  assert.match(adjusted, /interestEarnedCents/);

  const api = read("apps/frontend/src/api/banking.ts");
  assert.match(api, /service_charge_cents\?:/);
  assert.match(api, /interest_earned_cents\?:/);

  const fe = read("apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx");
  assert.match(fe, /service_charge_cents: serviceChargeCents/);
  assert.match(fe, /interest_earned_cents: interestEarnedCents/);

  console.log(`${LABEL}: OK — SC via expense engine + IE via JE + expense FK + costs-guard no bank_reconciliation exempt`);
}

if (process.argv.includes("--selftest")) {
  main();
  process.exit(0);
}

main();
