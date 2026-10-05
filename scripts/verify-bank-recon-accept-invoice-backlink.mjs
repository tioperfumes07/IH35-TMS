#!/usr/bin/env node
/**
 * ACCT-F5620 regression guard — the reconciliation "accept match" flow
 * (acceptMatchWithResolveDifference AND acceptExactMultiDocumentMatch, match.service.ts)
 * must re-attempt the payment→invoice back-link (backlinkBankTransactionToInvoice) for a
 * "payment" match, not just stamp matched_payment_id and stop. Otherwise a payment applied
 * to an invoice FIRST and matched to a bank transaction LATER (the ordering every live USMCA
 * case has actually taken) never gets matched_invoice_id set at all — the one-time attempt
 * inside apply.service.ts always ran with no source bank transaction yet, and this
 * reconciliation flow is its only other chance.
 *
 * ENG-SPINE follow-up: 1:1 already called the backlink; multi-document accept swept 1090 and
 * skipped the backlink + Faro rsv. Both paths must share runPaymentAcceptFollowUps.
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
const HELPER_MARKER = "async function runPaymentAcceptFollowUps";
const BACKLINK_IN_HELPER =
  "await backlinkBankTransactionToInvoice(\n    client,\n    args.operatingCompanyId,\n    args.paymentId,\n    invoiceRes.rows.map((r) => r.invoice_id)\n  );";
const ONE_TO_ONE_CALL = "await runPaymentAcceptFollowUps(client, {\n        operatingCompanyId: input.operating_company_id,\n        paymentId: matchLedgerEntryId,";
const MULTI_CALL = "await runPaymentAcceptFollowUps(client, {\n          operatingCompanyId: input.operating_company_id,\n          paymentId: entry.ledger_entry_id,";

function sliceFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const next = src.indexOf("\nexport async function", start + 10);
  return next > 0 ? src.slice(start, next) : src.slice(start);
}

function assertAll(src) {
  const problems = [];
  if (!src.includes(IMPORT_MARKER)) {
    problems.push("match.service.ts no longer imports backlinkBankTransactionToInvoice.");
  }
  if (!src.includes(INVOICE_QUERY_MARKER)) {
    problems.push("match.service.ts no longer looks up the payment's applied invoice(s) before backlinking.");
  }
  if (!src.includes(HELPER_MARKER)) {
    problems.push("runPaymentAcceptFollowUps is gone — 1:1 and multi-document payment follow-ups will drift.");
  }
  if (!src.includes(BACKLINK_IN_HELPER)) {
    problems.push(
      "runPaymentAcceptFollowUps no longer calls backlinkBankTransactionToInvoice -- " +
        "a payment matched to a bank transaction AFTER being applied to an invoice will never get " +
        "matched_invoice_id set, exactly the live-confirmed gap this guard exists to prevent."
    );
  }
  const oneToOne = sliceFn(src, "acceptMatchWithResolveDifference");
  if (!oneToOne.includes(ONE_TO_ONE_CALL)) {
    problems.push("acceptMatchWithResolveDifference must call runPaymentAcceptFollowUps for a payment match.");
  }
  const multi = sliceFn(src, "acceptExactMultiDocumentMatch");
  if (!multi.includes(MULTI_CALL)) {
    problems.push(
      "acceptExactMultiDocumentMatch must call runPaymentAcceptFollowUps for every payment entry -- " +
        "the 1:1-only backlink left multi-document wires matched_payment_id-only forever."
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const droppedHelperCall = src.replace(BACKLINK_IN_HELPER, "");
  if (droppedHelperCall === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: backlink-drop mutation string did not match live source`);
    process.exit(1);
  }
  const p1 = assertAll(droppedHelperCall);
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

  const droppedMulti = src.replace(MULTI_CALL, "await sweepMatchedReceiptToBank(client, input.operating_company_id, \"customer_payment_deposit\", entry.ledger_entry_id, input.actor_user_uuid);");
  if (droppedMulti === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: multi-call mutation string did not match live source`);
    process.exit(1);
  }
  const p3 = assertAll(droppedMulti);
  if (!p3.some((p) => p.includes("acceptExactMultiDocumentMatch must call runPaymentAcceptFollowUps"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the multi-document helper call not caught`);
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
console.log(`${LABEL} OK — 1:1 and multi-document accept share runPaymentAcceptFollowUps (invoice backlink + 1090 sweep + Faro rsv)`);
