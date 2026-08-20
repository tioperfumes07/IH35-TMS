#!/usr/bin/env node
/**
 * ACCT-F5620 regression guard — the reconciliation "accept match" flow
 * (acceptMatchWithResolveDifference, match.service.ts) must re-attempt the payment→invoice
 * back-link (backlinkBankTransactionToInvoice) for a "payment" match, not just stamp
 * matched_payment_id and stop. Otherwise a payment applied to an invoice FIRST and matched to a
 * bank transaction LATER (the ordering every live USMCA case has actually taken) never gets
 * matched_invoice_id set at all — the one-time attempt inside apply.service.ts always ran with no
 * source bank transaction yet, and this reconciliation flow is its only other chance. Confirmed live
 * on prod: 0 of 11,386 bank_transactions carry matched_invoice_id even though a real USMCA payment
 * (a22143c1...) is already matched_payment_id-linked AND applied to exactly one invoice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-recon-accept-invoice-backlink";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/bank-recon/match.service.ts";

const IMPORT_MARKER = 'import { backlinkBankTransactionToInvoice } from "../payments/bank-invoice-backlink.service.js";';
const INVOICE_QUERY_MARKER = "FROM accounting.payment_applications";
const CALL_MARKER = "await backlinkBankTransactionToInvoice(\n        client,\n        input.operating_company_id,\n        input.ledger_entry_id,\n        invoiceRes.rows.map((r) => r.invoice_id)\n      );";

function assertAll(src) {
  const problems = [];
  if (!src.includes(IMPORT_MARKER)) {
    problems.push("match.service.ts no longer imports backlinkBankTransactionToInvoice.");
  }
  if (!src.includes(INVOICE_QUERY_MARKER)) {
    problems.push("match.service.ts no longer looks up the payment's applied invoice(s) before backlinking.");
  }
  if (!src.includes(CALL_MARKER)) {
    problems.push(
      "acceptMatchWithResolveDifference's 'payment' branch no longer calls backlinkBankTransactionToInvoice -- " +
        "a payment matched to a bank transaction AFTER being applied to an invoice will never get " +
        "matched_invoice_id set, exactly the live-confirmed gap this guard exists to prevent."
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const droppedCall = src.replace(CALL_MARKER, "");
  if (droppedCall === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: call-drop mutation string did not match live source`);
    process.exit(1);
  }
  const p1 = assertAll(droppedCall);
  if (!p1.some((p) => p.includes("no longer calls backlinkBankTransactionToInvoice"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the backlink call not caught`);
    process.exit(1);
  }

  const droppedImport = src.replace(IMPORT_MARKER, "");
  const p2 = assertAll(droppedImport);
  if (!p2.some((p) => p.includes("no longer imports"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the import not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — reconciliation accept-match re-attempts the payment->invoice bank back-link, closing the apply-then-match ordering gap`);
