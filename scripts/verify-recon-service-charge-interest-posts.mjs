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
  assert.match(poster, /postSourceTransactionInClientTx/);
  assert.match(poster, /source_transaction_type: "expense"/);
  assert.match(poster, /is_company_expense/);
  assert.match(poster, /payment_account_uuid/);
  assert.match(poster, /createJournalEntryOnClient/); // interest still income JE (not a 5xxx/6xxx cost)
  assert.match(poster, /Interest earned/);
  // SC must not mint a bare cost JE: only one createJournalEntryOnClient *call* (interest).
  const jeCallSites = [...poster.matchAll(/await createJournalEntryOnClient\s*\(/g)];
  assert.equal(jeCallSites.length, 1, "exactly one await createJournalEntryOnClient (interest); SC uses expense engine");
  assert.match(poster, /createAndPostServiceChargeExpense\(/);

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
