#!/usr/bin/env node
/**
 * ACCT-F5612 regression guard — A/R aging must net applied, non-voided AR credit-memo cents off an
 * invoice's reported open balance.
 *
 * WHY THIS MATTERS: accounting.invoices.amount_open_cents is a GENERATED column
 * (total_cents - amount_paid_cents, migration 0123) with NO knowledge of
 * accounting.credit_memo_applications (added by ACCT-F5606). credit-memos.routes.ts already nets
 * applied, non-voided credit-memo cents off an invoice's TRUE remaining balance for its own
 * over-apply guard (SUM(applied_cents) WHERE voided_at IS NULL) — A/R aging, a real collections/DSO
 * report, must do the identical subtraction, or any invoice with an applied AR credit memo silently
 * overstates its reported open balance and the customer's reported outstanding total.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ar-aging-credit-memo-netting";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/ar-aging.service.ts";

const SELECT_LINE = "(i.amount_open_cents - COALESCE(cma.applied_cents, 0))::bigint AS amount_open_cents";
const SUBQUERY_JOIN = "LEFT JOIN (";
const SUBQUERY_FROM = "FROM accounting.credit_memo_applications";
const SUBQUERY_VOID_FILTER = "AND voided_at IS NULL";

function assertAll(src) {
  const problems = [];
  if (!src.includes(SELECT_LINE)) {
    problems.push(
      `A/R aging's SELECT does not net COALESCE(cma.applied_cents, 0) off amount_open_cents -- either ` +
        `reverted to selecting the raw generated column, or drifted to a different expression.`
    );
  }
  if (!src.includes(SUBQUERY_JOIN) || !src.includes(SUBQUERY_FROM)) {
    problems.push(
      `A/R aging does not LEFT JOIN a per-invoice accounting.credit_memo_applications subquery -- an ` +
        `applied AR credit memo will not be netted out of the reported balance at all.`
    );
  }
  const cmaBlockMatch = src.match(/LEFT JOIN \(([\s\S]*?)\) cma ON cma\.invoice_id = i\.id/);
  if (!cmaBlockMatch || !cmaBlockMatch[1].includes(SUBQUERY_VOID_FILTER)) {
    problems.push(
      `A/R aging's credit_memo_applications subquery does not exclude voided_at IS NOT NULL rows -- a ` +
        `voided (reversed) credit-memo application would still incorrectly reduce reported AR.`
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const revertedSelect = src.replace(SELECT_LINE, "i.amount_open_cents::bigint AS amount_open_cents");
  const revertedProblems = assertAll(revertedSelect);
  if (!revertedProblems.some((p) => p.includes("net"))) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to the raw ungenerated-netted column not caught`);
    process.exit(1);
  }

  const droppedVoidFilter = src.replace(`\n            AND voided_at IS NULL\n          GROUP BY invoice_id`, `\n          GROUP BY invoice_id`);
  if (droppedVoidFilter === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: droppedVoidFilter mutation string did not match live source`);
    process.exit(1);
  }
  const droppedProblems = assertAll(droppedVoidFilter);
  if (!droppedProblems.some((p) => p.includes("voided"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the voided_at IS NULL filter on the subquery not caught`);
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
console.log(`${LABEL} OK — A/R aging nets applied, non-voided credit-memo cents off each invoice's reported open balance`);
