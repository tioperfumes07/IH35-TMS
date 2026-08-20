#!/usr/bin/env node
/**
 * ACCT-F5673 — voiding a bill must cascade to its SOURCE bank transaction, and the linked-bank
 * reads must exclude voided transactions.
 *
 * Class this pins (BANK-TXN-LINKED-BILL-VOID-NO-CASCADE, measured live): bulk-post-as-bills and the
 * insurance wizard/dispersal stamp category='bill' + linked_entity_id on the source txn; voiding
 * the bill previously touched nothing — 24 USMCA placeholder txns sat categorized-and-linked to
 * void bills forever, polluting the linked-bank panel and every backlog view, with the honest-but-
 * dead-end reason bill_backed+VOID from the poster.
 *
 * Locked here:
 *   1. bills.service.ts exports cascadeBillVoidToSourceBankTransactions with BOTH arms:
 *      placeholder arm (plaid_transaction_id IS NULL → voided_at/voided_reason, WORM) and feed-line
 *      arm (plaid id present → revert to pending_categorization + clear linkage);
 *   2. both arms exclude rows carrying matched_journal_entry_id (an existing GL story voids through
 *      its own reversal path, never this cascade);
 *   3. BOTH bill-void executors (voidBill and voidBillInClientTx) invoke the cascade;
 *   4. the by-linkage panel query and the backlog route (categorization.routes.ts) both filter
 *      bt.voided_at IS NULL.
 *
 * Run:  node scripts/verify-bill-void-cascades-source-bank-txn.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-void-cascades-source-bank-txn";
const BILLS = "apps/backend/src/accounting/bills.service.ts";
const ROUTES = "apps/backend/src/banking/categorization.routes.ts";

export function analyze(files) {
  const failures = [];
  const bills = files[BILLS].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const routes = files[ROUTES].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");

  if (!/export async function cascadeBillVoidToSourceBankTransactions/.test(bills)) {
    failures.push(`${BILLS}: cascadeBillVoidToSourceBankTransactions must exist and be exported (the backfill runs through the same path).`);
    return failures;
  }
  const fnMatch = /export async function cascadeBillVoidToSourceBankTransactions[\s\S]*?\n\}/.exec(bills);
  const fn = fnMatch ? fnMatch[0] : "";
  if (!/voided_at = now\(\)[\s\S]*?plaid_transaction_id IS NULL/.test(fn)) {
    failures.push(`${BILLS}: the placeholder arm (plaid_transaction_id IS NULL → voided_at) is missing — seeded installment txns for a void bill represent nothing real and must void (WORM).`);
  }
  if (!/pending_categorization[\s\S]*?plaid_transaction_id IS NOT NULL/.test(fn)) {
    failures.push(`${BILLS}: the feed-line arm (plaid id present → revert to pending_categorization) is missing — a real money movement must stay re-categorizable, never voided away.`);
  }
  const jeGuards = (fn.match(/matched_journal_entry_id IS NULL/g) ?? []).length;
  if (jeGuards < 2) {
    failures.push(`${BILLS}: both cascade arms must exclude rows carrying matched_journal_entry_id (found ${jeGuards}/2) — an existing GL story voids through its own reversal path.`);
  }
  const callCount = (bills.match(/await cascadeBillVoidToSourceBankTransactions\(/g) ?? []).length;
  if (callCount < 2) {
    failures.push(`${BILLS}: both bill-void executors (voidBill + voidBillInClientTx) must invoke the cascade (found ${callCount}/2 call sites).`);
  }
  const voidedFilters = (routes.match(/bt\.voided_at IS NULL/g) ?? []).length;
  if (voidedFilters < 2) {
    failures.push(`${ROUTES}: both the by-linkage panel query and the backlog route must filter bt.voided_at IS NULL (found ${voidedFilters}/2) — cascade-voided txns must stop rendering as permanently JE-dark rows.`);
  }
  return failures;
}

function readAll() {
  const files = {};
  for (const f of [BILLS, ROUTES]) files[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
  return files;
}

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL files should PASS but failed: ${good.join("; ")}`);

  const m1 = { ...real, [BILLS]: real[BILLS].replace(/export async function cascadeBillVoidToSourceBankTransactions/, "async function cascadeBillVoidToSourceBankTransactions_renamed") };
  if (!analyze(m1).some((f) => f.includes("must exist and be exported"))) {
    throw new Error(`[${LABEL}] selftest: removed export should FAIL but passed`);
  }

  const m2 = { ...real, [BILLS]: real[BILLS].replace(/await cascadeBillVoidToSourceBankTransactions\(client, \{ operatingCompanyId, billId, userId, reason \}\);/, "") };
  if (!analyze(m2).some((f) => f.includes("2 call sites") || f.includes("1/2 call sites"))) {
    throw new Error(`[${LABEL}] selftest: removed voidBill call site should FAIL but passed`);
  }

  const m3 = { ...real, [ROUTES]: real[ROUTES].replace(/AND bt\.voided_at IS NULL\n\s+ORDER BY bt\.transaction_date ASC/, "ORDER BY bt.transaction_date ASC") };
  if (!analyze(m3).some((f) => f.includes("voided_at IS NULL (found"))) {
    throw new Error(`[${LABEL}] selftest: removed backlog voided filter should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; removed-export, removed-call-site and removed-read-filter mutations all red`);
  process.exit(0);
}

const failures = analyze(readAll());
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — bill void cascades to the source bank txn (both arms, both executors) and voided txns are excluded from the linked-bank reads`);
