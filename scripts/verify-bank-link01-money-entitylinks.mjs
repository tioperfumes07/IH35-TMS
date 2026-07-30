#!/usr/bin/env node
/**
 * BANK-LINK-01 / BANK-F07 — bank register must EntityLink money matches (Law §9 forward).
 * matched_bill_id was already on the API but never linked; payment / bill_payment / transfer
 * FKs must be projected + linked when stamped by recon/match write paths.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-link01-money-entitylinks";

const ROUTES = "apps/backend/src/integrations/plaid/link.routes.ts";
const API = "apps/frontend/src/api/banking.ts";
const VIEW = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

/** @param {{ routes: string, api: string, view: string }} sources */
export function contractErrors(sources) {
  const errors = [];
  const { routes, api, view } = sources;

  for (const col of ["matched_payment_id", "matched_bill_payment_id", "matched_transfer_id"]) {
    if (!routes.includes(`bt.${col}`)) {
      errors.push(`backend company-transactions must SELECT bt.${col}`);
    }
    if (!api.includes(col)) {
      errors.push(`api PlaidBankTransaction must declare ${col}`);
    }
  }
  if (!routes.includes("WHEN bt.matched_payment_id IS NOT NULL THEN 'payment'")) {
    errors.push("backend matched_kind CASE must include payment");
  }
  if (!routes.includes("WHEN bt.matched_bill_payment_id IS NOT NULL THEN 'bill_payment'")) {
    errors.push("backend matched_kind CASE must include bill_payment");
  }
  if (!routes.includes("WHEN bt.matched_transfer_id IS NOT NULL THEN 'transfer'")) {
    errors.push("backend matched_kind CASE must include transfer");
  }

  for (const [kind, testId] of [
    ["bill", "bank-txn-bill-link"],
    ["payment", "bank-txn-payment-link"],
    ["bill_payment", "bank-txn-bill-payment-link"],
    ["transfer", "bank-txn-transfer-link"],
  ]) {
    if (!view.includes(`kind="${kind}"`)) {
      errors.push(`DesignView must EntityLink kind=${kind}`);
    }
    if (!view.includes(`data-testid="${testId}"`)) {
      errors.push(`DesignView must expose data-testid=${testId}`);
    }
  }
  return errors;
}

export function run(root = ROOT) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  return contractErrors({
    routes: read(ROUTES),
    api: read(API),
    view: read(VIEW),
  });
}

if (process.argv.includes("--selftest")) {
  const good = {
    routes: [
      "bt.matched_payment_id",
      "bt.matched_bill_payment_id",
      "bt.matched_transfer_id",
      "WHEN bt.matched_payment_id IS NOT NULL THEN 'payment'",
      "WHEN bt.matched_bill_payment_id IS NOT NULL THEN 'bill_payment'",
      "WHEN bt.matched_transfer_id IS NOT NULL THEN 'transfer'",
    ].join("\n"),
    api: "matched_payment_id matched_bill_payment_id matched_transfer_id",
    view: [
      'kind="bill" data-testid="bank-txn-bill-link"',
      'kind="payment" data-testid="bank-txn-payment-link"',
      'kind="bill_payment" data-testid="bank-txn-bill-payment-link"',
      'kind="transfer" data-testid="bank-txn-transfer-link"',
    ].join("\n"),
  };
  if (contractErrors(good).length) throw new Error(`${LABEL} PASS fail`);
  if (!contractErrors({ ...good, view: "" }).length) throw new Error(`${LABEL} FAIL fail`);
  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
