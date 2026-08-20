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

// ACCT-F5658 — the mechanism this guard pins changed shape when A/R aging was rewritten to
// reconstruct open-as-of (mirroring ap-aging.service.ts): the credit-memo netting moved from a
// LEFT JOIN prejoin subtracted off the live generated column into an as-of-dated correlated
// subquery subtracted inside the GREATEST(total − payments − credit-memos, 0) reconstruction.
// The REQUIREMENT (ACCT-F5612: applied, non-voided credit-memo cents are netted off the reported
// balance) is unchanged; the assertions now target it in its current, dated form.
const SUBQUERY_SUBTRACT = "- COALESCE((\n                  SELECT SUM(cma.applied_cents)";
const SUBQUERY_FROM = "FROM accounting.credit_memo_applications cma";
const SUBQUERY_VOID_FILTER = "AND cma.voided_at IS NULL";
const SUBQUERY_AS_OF_FILTER = "AND (cma.applied_at AT TIME ZONE 'UTC')::date <= $2::date";

function assertAll(src) {
  const problems = [];
  if (!src.includes(SUBQUERY_SUBTRACT) || !src.includes(SUBQUERY_FROM)) {
    problems.push(
      `A/R aging does not subtract a per-invoice accounting.credit_memo_applications SUM inside its ` +
        `outstanding reconstruction -- an applied AR credit memo will not be netted out of the ` +
        `reported balance at all (ACCT-F5612).`
    );
  }
  if (!src.includes(SUBQUERY_VOID_FILTER)) {
    problems.push(
      `A/R aging's credit_memo_applications subquery does not exclude voided rows -- a voided ` +
        `(reversed) credit-memo application would still incorrectly reduce reported AR.`
    );
  }
  if (!src.includes(SUBQUERY_AS_OF_FILTER)) {
    problems.push(
      `A/R aging's credit_memo_applications subquery is not dated (applied_at <= as_of) -- a credit ` +
        `memo applied AFTER the statement date would wrongly reduce a historical statement (ACCT-F5658).`
    );
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const droppedNetting = src.split(SUBQUERY_FROM).join("FROM accounting.credit_memo_applications_RENAMED cma");
  if (droppedNetting === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: netting-subquery mutation string did not match live source`);
    process.exit(1);
  }
  if (!assertAll(droppedNetting).some((p) => p.includes("netted out"))) {
    console.error(`${LABEL} SELFTEST FAILED: removing the credit-memo netting subquery not caught`);
    process.exit(1);
  }

  const droppedVoidFilter = src.split(SUBQUERY_VOID_FILTER).join("");
  if (droppedVoidFilter === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: droppedVoidFilter mutation string did not match live source`);
    process.exit(1);
  }
  if (!assertAll(droppedVoidFilter).some((p) => p.includes("voided"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the voided_at IS NULL filter on the subquery not caught`);
    process.exit(1);
  }

  const droppedAsOf = src.split(SUBQUERY_AS_OF_FILTER).join("");
  if (droppedAsOf === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: droppedAsOf mutation string did not match live source`);
    process.exit(1);
  }
  if (!assertAll(droppedAsOf).some((p) => p.includes("dated"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the applied_at <= as_of dating not caught`);
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
