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
import { runExecutableGuard } from "./guard-executable-contract.mjs";

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

function checkSettlementReversalFixture(fixture) {
  return inspect(
    fixture.service,
    fixture.poster,
    fixture.bills,
    fixture.settlementPoster,
    fixture.governance,
    fixture.dbTest,
    fixture.unitTest,
    fixture.governanceTest
  );
}

function loadRepositoryFixture() {
  const files = {};
  for (const [key, rel] of Object.entries({
    service: SERVICE,
    poster: POSTER,
    bills: BILLS,
    settlementPoster: SETTLEMENT_POSTER,
    governance: GOVERNANCE,
    dbTest: DB_TEST,
    unitTest: UNIT_TEST,
    governanceTest: GOVERNANCE_TEST,
  })) {
    const absolute = path.join(ROOT, rel);
    files[key] = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
  }
  return files;
}

const goodFixture = {
  service: `
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
    }`,
  poster: `
    const lineId = null;
    class_id::text, entity_uuid::text
    resolveReversalDate(originalDate
    await ensureOpenPeriod(client
    export async function reversePostedSourceTransactionInClientTx`,
  bills:
    "export async function voidBillPaymentInClientTx export async function voidBillInClientTx reversePostedSourceTransactionInClientTx UPDATE banking.bank_accounts SET paid_cents = $2 revoked_at = now()",
  settlementPoster:
    "export async function restoreSettlementDeductionsInClientTx applied_to_settlement_id = NULL remaining_balance_cents = amount_cents reverseDeductionFromBucket settlement_deduction_restore_state_transition_failed",
  governance:
    "companyBusinessDate() reverseSettlementBillPaymentInClientTx UPDATE driver_finance.driver_settlements",
  dbTest:
    'Promise.all([ "nothing_to_reverse", "reversed" absolute_residual_cents resolveReversalJournalEntryIds linked_payment_count cancellationSnapshot injected_outer_audit_failure driver_deduction_bucket_events revoked_at IS NULL current_balance_cents row.status === "open"',
  unitTest:
    "PERIOD_LOCKED SET status = 'reversed' settlement_reversal_not_equal_and_opposite one transaction client currentBusinessDate WITH linked AS",
  governanceTest: "",
};
const badFixture = {
  service: `
    reversePostedSourceTransaction(x).catch(() => undefined);
    SET status = 'reversed';
  `,
  poster: "const lineId = sourceId",
  bills: "",
  settlementPoster: "",
  governance: "inherently multi-transaction",
  dbTest: "",
  unitTest: "",
  governanceTest: "Object.assign(state)",
};

runExecutableGuard({
  label: LABEL,
  checker: checkSettlementReversalFixture,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: [
    "source reversal failures are swallowed",
    "run state can transition before whole-settlement reconciliation",
    "fake Object.assign rollback proof remains",
  ],
});
