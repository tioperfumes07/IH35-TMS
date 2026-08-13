#!/usr/bin/env node
/**
 * ACCT-F16 / Law §9 — Receive Payment list+detail must expose reverse bank hop:
 * payment → banking.bank_transactions via source_bank_transaction_id OR matched_payment_id.
 * Twin of verify-bill-payment-list-reverse-links.mjs (bill_payment path).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-payment-bank-reverse-links";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** @param {{ routes: string, api: string, listPage: string, detailPage: string }} sources */
export function contractErrors(sources) {
  const errors = [];
  const { routes, api, listPage, detailPage } = sources;

  if (!routes.includes("PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL")) {
    errors.push("backend: must define PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL");
  }
  if (!routes.includes("p.source_bank_transaction_id")) {
    errors.push("backend: projection must prefer p.source_bank_transaction_id");
  }
  if (!routes.includes("bt.matched_payment_id = p.id")) {
    errors.push("backend: projection must fall back to bt.matched_payment_id = p.id");
  }
  if (!routes.includes("bt.operating_company_id = p.operating_company_id")) {
    errors.push("backend: bank reverse projection must be entity-scoped");
  }
  const asCount = routes.split("AS matched_bank_transaction_id").length - 1;
  if (asCount < 2) {
    errors.push(`backend: list + detail must expose AS matched_bank_transaction_id (found ${asCount} of 2)`);
  }
  if (!api.includes("matched_bank_transaction_id?: string | null")) {
    errors.push("api: Payment must expose matched_bank_transaction_id?: string | null");
  }
  for (const [surface, source] of [
    ["list", listPage],
    ["detail", detailPage],
  ]) {
    if (!source.includes('kind="bank_transaction"')) {
      errors.push(`${surface}: bank_transaction EntityLink missing`);
    }
    if (!source.includes("matched_bank_transaction_id")) {
      errors.push(`${surface}: must reference matched_bank_transaction_id`);
    }
  }
  // ACCT-F5073 — list must project bank date/description and not UUID-fallback.
  if (!/matched_bank_transaction_date/.test(routes) || !/matched_bank_transaction_description/.test(routes)) {
    errors.push("backend: list+detail must expose matched_bank_transaction_date/description");
  }
  if (/entityLabel\(\s*null\s*,\s*row\.matched_bank_transaction_id/.test(listPage)) {
    errors.push("list: must not entityLabel(null, matched_bank_transaction_id)");
  }
  if (!/matched_bank_transaction_date/.test(listPage) || !/matched_bank_transaction_description/.test(listPage)) {
    errors.push("list: must prefer matched_bank_transaction_date/description for EntityLink label");
  }
  return errors;
}

export function run(root = ROOT) {
  return contractErrors({
    routes: read("apps/backend/src/accounting/payments.routes.ts"),
    api: read("apps/frontend/src/api/accounting.ts"),
    listPage: read("apps/frontend/src/pages/accounting/PaymentsListPage.tsx"),
    detailPage: read("apps/frontend/src/pages/accounting/PaymentDetailPage.tsx"),
  });
}

if (process.argv.includes("--selftest")) {
  const good = {
    routes: [
      "const PAYMENT_MATCHED_BANK_TRANSACTION_ID_SQL = `",
      "COALESCE(p.source_bank_transaction_id::text,",
      "(SELECT bt.id FROM banking.bank_transactions bt",
      " WHERE bt.operating_company_id = p.operating_company_id",
      "   AND bt.matched_payment_id = p.id))",
      "AS matched_bank_transaction_id",
      "AS matched_bank_transaction_id",
      "matched_bank_transaction_date",
      "matched_bank_transaction_description",
    ].join("\n"),
    api: "matched_bank_transaction_id?: string | null",
    listPage:
      'kind="bank_transaction" matched_bank_transaction_id matched_bank_transaction_date matched_bank_transaction_description',
    detailPage: 'kind="bank_transaction" matched_bank_transaction_id',
  };
  const errs = contractErrors(good);
  if (errs.length) throw new Error(`${LABEL} PASS fail: ${errs.join("; ")}`);
  const bad = { ...good, detailPage: 'kind="account"' };
  if (!contractErrors(bad).length) throw new Error(`${LABEL} FAIL fail`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
