#!/usr/bin/env node
/**
 * 18374 — ROUND 443.22-2f OPTION 2 Scentsx-only related-party loan backfill via engine.
 *
 * Asserts the ops script:
 *   - calls createRelatedPartyLoanEntry (no direct INSERT into loan money tables as the feed)
 *   - Scentsx 2410-00-002 only (9 lines); HOLDs Jorge / Tio
 *   - bank_funding / bank_repayment + bank_transaction_id; interest 400 bps
 *   - rewrite_journal false; --execute/--expect-host gate; one transaction
 *
 * Owned paths:
 *   scripts/ops/r44322-2f-scentsx-option2-backfill.ts
 *
 * Run: node scripts/verify-related-party-loan-scentsx-option2-backfill.mjs [--selftest]
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const LABEL = "verify-related-party-loan-scentsx-option2-backfill";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPS = "scripts/ops/r44322-2f-scentsx-option2-backfill.ts";

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

export function staticProblems(src) {
  const errors = [];
  if (!src.includes("createRelatedPartyLoanEntry")) {
    errors.push("F1: ops must call createRelatedPartyLoanEntry (engine path)");
  }
  if (!src.includes("OPTION 2") && !src.includes("Option 2")) {
    errors.push("F1: ops must declare OPTION 2");
  }
  if (!src.includes("2410-00-002")) {
    errors.push("F2: ops must target Scentsx account 2410-00-002");
  }
  if (!src.includes("7e755038-8385-4453-8934-fef604656471")) {
    errors.push("F2: ops must pin Scentsx account id 7e755038-…");
  }
  if (!src.includes("EXPECTED_LINE_COUNT = 9") && !src.includes("EXPECTED_LINE_COUNT=9")) {
    errors.push("F2: ops must lock EXPECTED_LINE_COUNT = 9");
  }
  if (!src.includes("1_145_000") && !src.includes("1145000")) {
    errors.push("F2: ops must lock expected open +$11,450 (1145000 cents)");
  }
  if (!src.includes("bank_funding") || !src.includes("bank_repayment")) {
    errors.push("F3: ops must use bank_funding and bank_repayment target types");
  }
  if (!src.includes("INTEREST_RATE_BPS = 400") && !src.includes("interest_rate_bps: 400")) {
    errors.push("F3: ops must use 400 bps (4.00%)");
  }
  if (!src.includes("--execute") || !src.includes("--expect-host")) {
    errors.push("F4: ops must gate writes with --execute + --expect-host");
  }
  if (!src.includes("single_transaction") && !src.includes("ONE transaction")) {
    errors.push("F4: ops must run in one transaction (Rule 53)");
  }
  if (!src.includes("rewrite_journal: false") && !src.includes("rewrite_journal = false")) {
    errors.push("F4: ops must set rewrite_journal false");
  }
  if (!src.includes("HOLD") || !src.includes("2410-00-001") || !src.includes("2410-00-003")) {
    errors.push("F5: ops must HOLD Jorge (2410-00-001) and Tio (2410-00-003)");
  }
  // Must not be a Neon bulk INSERT substitute for the create writer.
  if (/INSERT\s+INTO\s+accounting\.related_party_loan_entries/i.test(src)) {
    errors.push("F6: ops must not hand-INSERT related_party_loan_entries (engine only)");
  }
  if (/INSERT\s+INTO\s+accounting\.journal_entry/i.test(src)) {
    errors.push("F6: ops must not INSERT journal entries");
  }
  return errors;
}

function selftest() {
  const good = read(OPS);
  const baseline = staticProblems(good);
  if (baseline.length) {
    fail([`selftest baseline rejected good ops:\n  ${baseline.join("\n  ")}`]);
  }
  const tmp = join(tmpdir(), `r44322-2f-scentsx-selftest-${process.pid}.ts`);
  const broken = good
    .replaceAll("createRelatedPartyLoanEntry", "createHidden")
    .replaceAll("2410-00-002", "2410-00-999")
    .replaceAll("INTEREST_RATE_BPS = 400", "INTEREST_RATE_BPS = 0");
  writeFileSync(tmp, broken);
  try {
    const planted = staticProblems(broken);
    if (planted.length < 3) {
      fail([`selftest expected ≥3 plants; got ${planted.length}: ${planted.join("; ")}`]);
    }
  } finally {
    unlinkSync(tmp);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    if (!existsSync(join(ROOT, OPS))) fail([`missing ${OPS}`]);
    selftest();
    return;
  }
  if (!existsSync(join(ROOT, OPS))) fail([`missing ${OPS}`]);
  const errors = staticProblems(read(OPS));
  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — Scentsx Option 2 ops calls engine; 9 lines / +$11450 / 400bps; Jorge+Tio HOLD`);
}

main();
