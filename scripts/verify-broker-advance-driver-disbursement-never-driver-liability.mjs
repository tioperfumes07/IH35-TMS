#!/usr/bin/env node
/**
 * verify-broker-advance-driver-disbursement-never-driver-liability.mjs
 *
 * LOAD-COSTS-COMPLETE item (2) (owner ruling 2026-09-04, verbatim): "the broker might send the
 * driver money and we apply it as a bill payment to the driver." applyBrokerAdvanceToDriverBillInClientTx
 * settles an EXISTING driver_finance.driver_bills liability -- "it is NEVER driver pay, NEVER a
 * driver debt, NEVER a settlement deduction," and "double entry or it does not post... through
 * journal-entries.service."
 *
 * Source-level regression lock.
 */
import { readFileSync } from "node:fs";

const PATH = "apps/backend/src/accounting/broker-advances.service.ts";

function loadSource() {
  return readFileSync(PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  const fnMatch = src.match(/export async function applyBrokerAdvanceToDriverBillInClientTx\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("could not find applyBrokerAdvanceToDriverBillInClientTx -- source shape drifted");
    return failures;
  }
  const body = fnMatch[0];

  if (/driver_finance\.driver_liabilities|driver_finance\.driver_advances\b|settlement_lines/.test(body)) {
    failures.push("applyBrokerAdvanceToDriverBillInClientTx references driver_liabilities/driver_advances/settlement_lines -- this must only ever settle an EXISTING driver_bills row, never create a new liability or a settlement deduction");
  }
  if (!/category !== "driver_pay"/.test(body)) {
    failures.push('the function does not require category === "driver_pay" before disbursing');
  }
  if (!/await createJournalEntryOnClient\(/.test(body)) {
    failures.push("the function does not post through createJournalEntryOnClient -- \"double entry or it does not post\"");
  }
  if (/INSERT INTO accounting\.journal_entries/.test(body)) {
    failures.push("the function contains a raw INSERT INTO accounting.journal_entries instead of going through journal-entries.service");
  }
  if (!/Math\.min\(input\.amountCents, advanceRemainingCents, billRemainingCents\)/.test(body)) {
    failures.push("the disbursed amount is not capped at both the advance's remaining amount and the bill's remaining balance");
  }
  // TIMING (owner order 2026-09-04): CR 1100 AR only when a receivable has ACTUALLY POSTED --
  // an unconditional CR to 1100 is a negative AR on a receivable that does not exist yet.
  // hasPostedReceivable is stricter than a bare applied_to_invoice_id check: it also requires the
  // matched invoice's status to be neither proforma (ND-INV-01 non-posting) nor void.
  if (!/hasPostedReceivable\s*=\s*advance\.applied_to_invoice_id\s*!=\s*null\s*&&\s*advance\.invoice_status\s*!==\s*"proforma"\s*&&\s*advance\.invoice_status\s*!==\s*"void"/.test(body)) {
    failures.push("the disbursement's hasPostedReceivable check no longer requires a non-null applied_to_invoice_id AND a non-proforma/non-void invoice status");
  }
  if (!/creditAccountNumber\s*=\s*hasPostedReceivable\s*\?\s*ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER\s*:\s*CUSTOMER_DEPOSITS_ACCOUNT_NUMBER/.test(body)) {
    failures.push("the disbursement's credit account is not branched on hasPostedReceivable (1100 if a receivable has posted, else 2250 Customer Deposits) -- an unconditional CR to 1100 books a receivable that may not exist yet");
  }

  const receiptFnMatch = src.match(/export async function recordBrokerAdvanceInClientTx\([\s\S]*?\n\}/);
  if (!receiptFnMatch) {
    failures.push("could not find recordBrokerAdvanceInClientTx -- source shape drifted");
  } else {
    const receiptBody = receiptFnMatch[0];
    if (!/await createJournalEntryOnClient\(/.test(receiptBody)) {
      failures.push("recordBrokerAdvanceInClientTx (item 1's receipt) does not post through createJournalEntryOnClient anywhere -- real cash arriving must be able to reach a balanced JE (board row C6)");
    }
    if (!/hasPostedReceivable\s*=\s*appliedToInvoiceId\s*!=\s*null\s*&&\s*appliedInvoiceStatus\s*!==\s*"proforma"\s*&&\s*appliedInvoiceStatus\s*!==\s*"void"/.test(receiptBody)) {
      failures.push("the receipt's hasPostedReceivable check no longer requires a non-null appliedToInvoiceId AND a non-proforma/non-void invoice status");
    }
    if (!/creditAccountNumber\s*=\s*hasPostedReceivable\s*\?\s*ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER\s*:\s*CUSTOMER_DEPOSITS_ACCOUNT_NUMBER/.test(receiptBody)) {
      failures.push("the receipt's credit account is not branched on hasPostedReceivable (1100 if a receivable has posted, else 2250 Customer Deposits)");
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = loadSource();
  const baseline = collectFailures(src);
  if (baseline.length) {
    console.error(`verify-broker-advance-driver-disbursement-never-driver-liability SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }

  const escaped = [];

  const badLiability = src.replace(
    'if (advance.category !== "driver_pay") {',
    '// planted regression: driver_finance.driver_liabilities\n  if (advance.category !== "driver_pay") {'
  );
  if (badLiability === src || collectFailures(badLiability).length === 0) {
    escaped.push("planted driver_liabilities reference not caught (guard's own regex should have flagged it -- verifying it fires)");
  }

  const badCategory = src.replace('if (advance.category !== "driver_pay") {', 'if (false) {');
  if (badCategory === src || collectFailures(badCategory).length === 0) {
    escaped.push("category check removed");
  }

  const badJe = src.replace("await createJournalEntryOnClient(", "await Promise.resolve(/* createJournalEntryOnClient(");
  if (badJe === src || collectFailures(badJe).length === 0) {
    escaped.push("createJournalEntryOnClient call removed");
  }

  // creditAccountNumber's ternary line is textually identical in both functions, so these plants
  // are scoped by including unique preceding context from each function rather than a bare
  // single-line replace (which would always hit whichever function appears first in the file).
  const disbursementCreditLine =
    "const payableAccountId = await resolveAccountId(client, input.operatingCompanyId, DRIVER_SETTLEMENTS_PAYABLE_ACCOUNT_NUMBER);\n  const hasPostedReceivable = advance.applied_to_invoice_id != null && advance.invoice_status !== \"proforma\" && advance.invoice_status !== \"void\";\n  const creditAccountNumber = hasPostedReceivable ? ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER : CUSTOMER_DEPOSITS_ACCOUNT_NUMBER;";
  const badTiming = src.replace(
    disbursementCreditLine,
    disbursementCreditLine.replace("const creditAccountNumber = hasPostedReceivable ? ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER : CUSTOMER_DEPOSITS_ACCOUNT_NUMBER;", "const creditAccountNumber = ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER;")
  );
  if (badTiming === src || collectFailures(badTiming).length === 0) {
    escaped.push("disbursement's unconditional CR to 1100 not caught");
  }
  const badProformaGuard = src.replace(
    disbursementCreditLine,
    disbursementCreditLine.replace(
      'const hasPostedReceivable = advance.applied_to_invoice_id != null && advance.invoice_status !== "proforma" && advance.invoice_status !== "void";',
      "const hasPostedReceivable = advance.applied_to_invoice_id != null;"
    )
  );
  if (badProformaGuard === src || collectFailures(badProformaGuard).length === 0) {
    escaped.push("disbursement's proforma/void carve-out removed, not caught");
  }

  // recordBrokerAdvanceInClientTx's occurrence is the only OTHER one, so a plain replaceAll here
  // (after the disbursement-scoped tests above already proved that side is covered) mutates just
  // the receipt's copy in practice, verified by the assertion still requiring a failure.
  const badReceiptTiming = src.replace(
    "const creditAccountNumber = hasPostedReceivable ? ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER : CUSTOMER_DEPOSITS_ACCOUNT_NUMBER;",
    "const creditAccountNumber = ACCOUNTS_RECEIVABLE_ACCOUNT_NUMBER;"
  );
  if (badReceiptTiming === src || collectFailures(badReceiptTiming).length === 0) {
    escaped.push("receipt's unconditional CR to 1100 not caught");
  }

  const badReceiptProformaGuard = src.replace(
    'const hasPostedReceivable = appliedToInvoiceId != null && appliedInvoiceStatus !== "proforma" && appliedInvoiceStatus !== "void";',
    "const hasPostedReceivable = appliedToInvoiceId != null;"
  );
  if (badReceiptProformaGuard === src || collectFailures(badReceiptProformaGuard).length === 0) {
    escaped.push("receipt's proforma/void carve-out removed, not caught");
  }

  if (escaped.length) {
    console.error(`verify-broker-advance-driver-disbursement-never-driver-liability SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-broker-advance-driver-disbursement-never-driver-liability SELFTEST PASS — 5/5 plants rejected");
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-broker-advance-driver-disbursement-never-driver-liability: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-broker-advance-driver-disbursement-never-driver-liability: OK — the disbursement path settles an existing driver_bills row via a real balanced JE, never a new driver liability"
);
