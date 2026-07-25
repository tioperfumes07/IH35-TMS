#!/usr/bin/env node
/**
 * Law §9: the bill-payment list and detail must expose both existing reverse legs:
 * payment -> posted JE and payment -> canonical banking.bank_transactions row.
 * This guard is static because a real DB proof belongs to CI's isolated Postgres suite.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-payment-list-reverse-links";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function contractErrors(sources) {
  const errors = [];
  const { service, api, listPage, detailPage } = sources;

  for (const identifier of ["journal_entry_id", "matched_bank_transaction_id"]) {
    const projections = service.split(`AS ${identifier}`).length - 1;
    if (projections < 3) {
      errors.push(`backend: list, bill sub-list, and detail must expose ${identifier} (found ${projections} of 3)`);
    }
    if (!api.includes(`${identifier}?: string | null`)) {
      errors.push(`api: BillPayment must expose ${identifier}`);
    }
  }

  for (const fragment of [
    "jep.source_transaction_type = 'bill_payment'",
    "jep.source_transaction_id = bp.id::text",
    "bt.operating_company_id = bp.operating_company_id",
    "bt.matched_bill_payment_id = bp.id",
  ]) {
    if (!service.includes(fragment)) {
      errors.push(`backend: missing entity-scoped reverse projection ${fragment}`);
    }
  }

  for (const [surface, source] of [
    ["list", listPage],
    ["detail", detailPage],
  ]) {
    if (!source.includes('kind="journal_entry"')) {
      errors.push(`${surface}: JE EntityLink missing`);
    }
    if (!source.includes('kind="bank_transaction"')) {
      errors.push(`${surface}: bank transaction EntityLink missing`);
    }
  }
  return errors;
}

function assertPass(sources, label) {
  const errors = contractErrors(sources);
  if (errors.length) throw new Error(`${label}: ${errors.join("; ")}`);
}

function selftest(sources) {
  assertPass(sources, "corrected shape");
  const mutations = [
    ["JE projection", { ...sources, service: sources.service.replaceAll("AS journal_entry_id", "AS hidden_journal_entry_id") }],
    ["bank projection", { ...sources, service: sources.service.replaceAll("AS matched_bank_transaction_id", "AS hidden_bank_transaction_id") }],
    ["list bank link", { ...sources, listPage: sources.listPage.replace('kind="bank_transaction"', 'kind="bank_account"') }],
    ["detail JE link", { ...sources, detailPage: sources.detailPage.replace('kind="journal_entry"', 'kind="account"') }],
  ];
  for (const [name, mutated] of mutations) {
    if (contractErrors(mutated).length === 0) throw new Error(`inert selftest mutation: ${name}`);
  }
}

const sources = {
  service: read("apps/backend/src/accounting/bills.service.ts"),
  api: read("apps/frontend/src/api/accounting.ts"),
  listPage: read("apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx"),
  detailPage: read("apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx"),
};

try {
  assertPass(sources, LABEL);
  if (process.argv.includes("--selftest")) selftest(sources);
  console.log(`${LABEL} PASS`);
} catch (error) {
  console.error(`${LABEL} FAIL: ${error.message}`);
  process.exit(1);
}
