#!/usr/bin/env node
/**
 * ROUND 313 BANK-SURF-04 / BANK-ECON-04 — Finish reconcile posts service charge + interest
 * through createJournalEntryOnClient (not FE-local only).
 *
 * Static: migration columns present; poster service exists; complete body schema accepts
 * service_charge_* / interest_earned_*; FE completeReconciliationSession sends the fields;
 * adjusted-balance formula includes SC/IE.
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
  const mig = read("db/migrations/202615141200_recon_session_service_charge_interest.sql");
  assert.match(mig, /service_charge_cents/);
  assert.match(mig, /interest_earned_cents/);
  assert.match(mig, /service_charge_journal_entry_id/);
  assert.match(mig, /interest_earned_journal_entry_id/);
  assert.match(mig, /ADD COLUMN IF NOT EXISTS/);

  const poster = read("apps/backend/src/banking/recon-adjustments.service.ts");
  assert.match(poster, /createJournalEntryOnClient/);
  assert.match(poster, /bank_reconciliation/);
  assert.match(poster, /debit_or_credit: "debit"/);
  assert.match(poster, /debit_or_credit: "credit"/);

  const routes = read("apps/backend/src/banking/reconciliation.routes.ts");
  assert.match(routes, /postReconciliationAdjustments/);
  assert.match(routes, /service_charge_cents/);
  assert.match(routes, /interest_earned_cents/);

  const adjusted = read("apps/backend/src/banking/adjusted-balance-rec.ts");
  assert.match(adjusted, /serviceChargeCents/);
  assert.match(adjusted, /interestEarnedCents/);

  const api = read("apps/frontend/src/api/banking.ts");
  assert.match(api, /service_charge_cents\?:/);
  assert.match(api, /interest_earned_cents\?:/);

  const fe = read("apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx");
  assert.match(fe, /service_charge_cents: serviceChargeCents/);
  assert.match(fe, /interest_earned_cents: interestEarnedCents/);
  assert.doesNotMatch(fe, /Session-LOCAL only/);

  console.log(`${LABEL}: OK — migration + poster + complete route + FE payload + adjusted-balance SC/IE wired`);
}

if (process.argv.includes("--selftest")) {
  main();
  process.exit(0);
}

main();
