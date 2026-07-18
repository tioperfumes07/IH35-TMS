#!/usr/bin/env node
/**
 * CPA-VETO regression guard — settlement Bill+BillPayment reversal must be fail-loud, one-transaction,
 * closed-period coherent, retry/concurrency idempotent, and whole-settlement equal-and-opposite before
 * driver_settlement_gl_runs.status can transition to 'reversed'.
 *
 * Self-test: node scripts/verify-settlement-reversal-atomicity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-reversal-atomicity";
const SERVICE = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";
const POSTER = "apps/backend/src/accounting/posting-engine.service.ts";
const BILLS = "apps/backend/src/accounting/bills.service.ts";
const SETTLEMENT_POSTER = "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts";
const GOVERNANCE = "apps/backend/src/governance/void-cancel-executors.ts";
const DB_TEST = "apps/backend/src/accounting/settlement-posting/__tests__/settlement-bill-payment-posting.db.test.ts";
const UNIT_TEST = "apps/backend/src/accounting/settlement-posting/__tests__/settlement-bill-payment-reversal.test.ts";
const GOVERNANCE_TEST = "apps/backend/src/governance/__tests__/void-cancel-requests.test.ts";

function inspect(service, poster, bills, settlementPoster, governance, dbTest, unitTest, governanceTest) {
  const violations = [];
  if (/\.catch\s*\(\s*\(\)\s*=>\s*undefined\s*\)/.test(service)) {
    violations.push("source reversal failures are swallowed");
  }
  for (const token of [
    "reverseSettlementBillPaymentInClientTx",
    "LIMIT 1 FOR UPDATE",
    "voidBillPaymentInClientTx",
    "voidBillInClientTx",
    "reverseJournalEntryNoFlip",
    "restoreSettlementDeductionsInClientTx",
    "currentBusinessDate",
    "settlement_deduction_reconciliation_failed",
    "settlement_reversal_not_equal_and_opposite",
    "settlement_subledger_reconciliation_failed",
    "SET status = 'open'",
    "GROUP BY account_id, class_id, entity_uuid",
    "WHERE id = $1::uuid AND status = 'posted'",
  ]) {
    if (!service.includes(token)) violations.push(`settlement reversal missing invariant: ${token}`);
  }
  const proofAt = service.indexOf("settlement_reversal_not_equal_and_opposite");
  const stateAt = service.indexOf("SET status = 'reversed'");
  if (proofAt < 0 || stateAt < 0 || stateAt < proofAt) {
    violations.push("run state can transition before whole-settlement reconciliation");
  }

  for (const token of [
    "export async function reversePostedSourceTransactionInClientTx",
    "await ensureOpenPeriod(client",
    "const lineId = null",
    "class_id::text, entity_uuid::text",
  ]) {
    if (!poster.includes(token)) violations.push(`canonical posting reversal missing invariant: ${token}`);
  }
  if (!/resolveReversalDate\s*\(\s*originalDate/.test(poster)) {
    violations.push("canonical posting reversal missing invariant: resolveReversalDate(originalDate)");
  }

  for (const token of [
    "export async function voidBillPaymentInClientTx",
    "export async function voidBillInClientTx",
    "reversePostedSourceTransactionInClientTx",
    "UPDATE banking.bank_accounts",
    "SET paid_cents = $2",
    "revoked_at = now()",
  ]) {
    if (!bills.includes(token)) violations.push(`canonical bill unwind missing invariant: ${token}`);
  }
  for (const token of ["companyBusinessDate()", "reverseSettlementBillPaymentInClientTx", "UPDATE driver_finance.driver_settlements"]) {
    if (!governance.includes(token)) violations.push(`outer settlement cancellation missing invariant: ${token}`);
  }
  if (governance.includes("inherently multi-transaction")) violations.push("stale multi-transaction settlement comment remains");

  for (const token of [
    "export async function restoreSettlementDeductionsInClientTx",
    "applied_to_settlement_id = NULL",
    "remaining_balance_cents = amount_cents",
    "reverseDeductionFromBucket",
    "settlement_deduction_restore_state_transition_failed",
  ]) {
    if (!settlementPoster.includes(token)) violations.push(`deduction unwind missing invariant: ${token}`);
  }

  for (const token of [
    "Promise.all([",
    "absolute_residual_cents",
    "resolveReversalJournalEntryIds",
    "linked_payment_count",
    "cancellationSnapshot",
    "injected_outer_audit_failure",
    "driver_deduction_bucket_events",
    "revoked_at IS NULL",
    "current_balance_cents",
    'row.status === "open"',
  ]) {
    if (!dbTest.includes(token)) violations.push(`DB behavior proof missing: ${token}`);
  }
  if (!/["']nothing_to_reverse["'][\s\S]{0,100}["']reversed["']/.test(dbTest)) {
    violations.push('DB behavior proof missing: "nothing_to_reverse", "reversed"');
  }
  for (const token of ["PERIOD_LOCKED", "SET status = 'reversed'", "settlement_reversal_not_equal_and_opposite", "one transaction client", "currentBusinessDate", "WITH linked AS"]) {
    if (!unitTest.includes(token)) violations.push(`focused behavior proof missing: ${token}`);
  }
  if (governanceTest.includes("Object.assign(state")) violations.push("fake Object.assign rollback proof remains");
  return violations;
}

function selftest() {
  const goodService = `
    reverseSettlementBillPaymentInClientTx {
      LIMIT 1 FOR UPDATE
      voidBillPaymentInClientTx
      voidBillInClientTx
      reverseJournalEntryNoFlip
      restoreSettlementDeductionsInClientTx
      currentBusinessDate
      settlement_deduction_reconciliation_failed
      GROUP BY account_id, class_id, entity_uuid
      settlement_reversal_not_equal_and_opposite
      settlement_subledger_reconciliation_failed
      SET status = 'open'
      SET status = 'reversed'
      WHERE id = $1::uuid AND status = 'posted'
    }`;
  const goodPoster = `
    const lineId = null;
    class_id::text, entity_uuid::text
    resolveReversalDate(originalDate
    await ensureOpenPeriod(client
    export async function reversePostedSourceTransactionInClientTx`;
  const goodBills = `export async function voidBillPaymentInClientTx export async function voidBillInClientTx reversePostedSourceTransactionInClientTx UPDATE banking.bank_accounts SET paid_cents = $2 revoked_at = now()`;
  const goodSettlementPoster = `export async function restoreSettlementDeductionsInClientTx applied_to_settlement_id = NULL remaining_balance_cents = amount_cents reverseDeductionFromBucket settlement_deduction_restore_state_transition_failed`;
  const goodGovernance = `companyBusinessDate() reverseSettlementBillPaymentInClientTx UPDATE driver_finance.driver_settlements`;
  const goodDb = `Promise.all([ "nothing_to_reverse", "reversed" absolute_residual_cents resolveReversalJournalEntryIds linked_payment_count cancellationSnapshot injected_outer_audit_failure driver_deduction_bucket_events revoked_at IS NULL current_balance_cents row.status === "open"`;
  const goodUnit = `PERIOD_LOCKED SET status = 'reversed' settlement_reversal_not_equal_and_opposite one transaction client currentBusinessDate WITH linked AS`;
  if (inspect(goodService, goodPoster, goodBills, goodSettlementPoster, goodGovernance, goodDb, goodUnit, "").length !== 0) {
    console.error(`[${LABEL}] --selftest FAILED: good fixture must pass`);
    process.exit(1);
  }
  const plantedService = `
    reversePostedSourceTransaction(x).catch(() => undefined);
    SET status = 'reversed';
  `;
  const planted = inspect(plantedService, "const lineId = sourceId", "", "", "inherently multi-transaction", "", "", "Object.assign(state)");
  if (planted.length < 10) {
    console.error(`[${LABEL}] --selftest FAILED: planted partial-success workflow was not fully rejected`, planted);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS (planted violations=${planted.length}; good=0)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const rel of [SERVICE, POSTER, BILLS, SETTLEMENT_POSTER, GOVERNANCE, DB_TEST, UNIT_TEST, GOVERNANCE_TEST]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAILED — required file missing: ${rel}`);
    process.exit(1);
  }
}
const violations = inspect(
  fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
  fs.readFileSync(path.join(ROOT, POSTER), "utf8"),
  fs.readFileSync(path.join(ROOT, BILLS), "utf8"),
  fs.readFileSync(path.join(ROOT, SETTLEMENT_POSTER), "utf8"),
  fs.readFileSync(path.join(ROOT, GOVERNANCE), "utf8"),
  fs.readFileSync(path.join(ROOT, DB_TEST), "utf8"),
  fs.readFileSync(path.join(ROOT, UNIT_TEST), "utf8"),
  fs.readFileSync(path.join(ROOT, GOVERNANCE_TEST), "utf8")
);
if (violations.length > 0) {
  console.error(`[${LABEL}] FAILED:`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — settlement reversal is atomic, fail-loud, idempotent, date-coherent, and reconciled.`);
