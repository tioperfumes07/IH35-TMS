#!/usr/bin/env node
/**
 * WAVE-H3 — bank acceptMatch reverse FK stamp (LINK-007 / LINK-008).
 *
 * Forward matched_payment_id / matched_bill_payment_id alone left money.source_bank_transaction_id
 * null (CLS-LINKAGE-ONEWAY). Guard locks reverse COALESCE stamps + unit tests.
 *
 * Mutation-tested (--selftest). No mass backfill.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-h3-bank-match-reverse-fk";
const SELFTEST = process.argv.includes("--selftest");
const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const TEST = "apps/backend/src/accounting/bank-recon/__tests__/accept-match-h3-reverse-bank-fk.test.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

export function staticChecks(sources = {}) {
  const problems = [];
  const svc = sources.service ?? read(SERVICE);
  const test = sources.test ?? read(TEST);

  if (!/UPDATE accounting\.payments[\s\S]{0,200}source_bank_transaction_id\s*=\s*COALESCE/.test(svc)) {
    problems.push("acceptMatch must reverse-stamp accounting.payments.source_bank_transaction_id via COALESCE");
  }
  if (
    !/UPDATE accounting\.bill_payments[\s\S]{0,300}source_bank_transaction_id\s*=\s*COALESCE/.test(svc) ||
    !/from_bank_account_id\s*=\s*COALESCE/.test(svc)
  ) {
    problems.push("acceptMatch must reverse-stamp bill_payments.source_bank_transaction_id + from_bank_account_id");
  }
  if (!/ledger_entry_kind === "payment"/.test(svc) || !/ledger_entry_kind === "bill_payment"/.test(svc)) {
    problems.push("reverse stamps must be gated on payment / bill_payment kinds");
  }
  if (!/UPDATE accounting\.payments/.test(test) || !/UPDATE accounting\.bill_payments/.test(test)) {
    problems.push("unit test must assert reverse UPDATEs for payment and bill_payment");
  }
  if (!/WAVE-H3/.test(test)) {
    problems.push("unit test must identify WAVE-H3");
  }
  return problems;
}

function selftest() {
  const goodSvc = read(SERVICE);
  const goodTest = read(TEST);
  if (staticChecks({ service: goodSvc, test: goodTest }).length) fail("selftest: clean must PASS");
  const bad = goodSvc.replace(/UPDATE accounting\.payments[\s\S]*?operating_company_id = \$3::uuid`/, "/* removed */");
  if (!staticChecks({ service: bad, test: goodTest }).length) fail("selftest: missing payment reverse must FAIL");
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  for (const rel of [SERVICE, TEST]) {
    if (!fs.existsSync(path.join(ROOT, rel))) fail(`missing ${rel}`);
  }
  const problems = staticChecks();
  if (problems.length) fail(problems.join("; "));
  console.log(`${LABEL} PASS — WAVE-H3 reverse bank FK stamps locked`);
}

main();
