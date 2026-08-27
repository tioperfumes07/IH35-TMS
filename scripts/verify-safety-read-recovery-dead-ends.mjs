#!/usr/bin/env node
/**
 * verify-safety-read-recovery-dead-ends.mjs
 *
 * SAFETY-MONEY-F6437-READ-RECOVERY-DEAD-ENDS — two mounted money-bearing Safety reads disclosed a
 * rejected company-scoped GET as terminal text with no recovery, and kept rendering whatever data
 * TanStack Query had last successfully fetched (stale-on-error) as if it were current:
 *   - EscrowRecordTab.tsx: the escrow balance table kept its rows after a failed refetch, with a
 *     static "Unable to load escrow records." banner above it and no way to retry.
 *   - FineLifecycleActions.tsx: the fine-payment bank-transaction picker showed a static
 *     "Couldn't load..." message with no retry, and the picker's own options list could still hold
 *     stale transactions from a prior successful fetch — a money-consequential selection (which
 *     bank transaction paid this fine) presented as current when it might not be.
 *
 * Fixed by suppressing the derived rows/options while isError is true, and adding a `refetch()`
 * button to each failure branch.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ESCROW_FILE = "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx";
const FINE_FILE = "apps/frontend/src/pages/safety/components/FineLifecycleActions.tsx";

export function check(escrowSrc, fineSrc) {
  const failures = [];

  if (!/const rowsAll = escrowQuery\.isError \? \[\] : \(escrowQuery\.data\?\.records \?\? \[\]\);/.test(escrowSrc)) {
    failures.push(`${ESCROW_FILE}: rowsAll no longer suppresses stale escrow records while escrowQuery.isError`);
  }
  if (!/data-testid="escrow-records-retry"/.test(escrowSrc)) {
    failures.push(`${ESCROW_FILE}: escrow-records-retry button is missing`);
  }
  if (!/onClick=\{\(\) => void escrowQuery\.refetch\(\)\}/.test(escrowSrc)) {
    failures.push(`${ESCROW_FILE}: the retry button no longer calls escrowQuery.refetch()`);
  }

  if (!/bankTxQuery\.isError\s*\n\s*\? \[\]/.test(fineSrc)) {
    failures.push(`${FINE_FILE}: bankOptions no longer suppresses stale bank transactions while bankTxQuery.isError`);
  }
  if (!/data-testid="fine-payment-picker-retry"/.test(fineSrc)) {
    failures.push(`${FINE_FILE}: fine-payment-picker-retry button is missing`);
  }
  if (!/onClick=\{\(\) => void bankTxQuery\.refetch\(\)\}/.test(fineSrc)) {
    failures.push(`${FINE_FILE}: the retry button no longer calls bankTxQuery.refetch()`);
  }

  return failures;
}

function readAll() {
  return {
    escrowSrc: fs.readFileSync(path.join(root, ESCROW_FILE), "utf8"),
    fineSrc: fs.readFileSync(path.join(root, FINE_FILE), "utf8"),
  };
}

function run() {
  const { escrowSrc, fineSrc } = readAll();
  const failures = check(escrowSrc, fineSrc);
  if (failures.length > 0) {
    console.error("FAIL: safety-read-recovery-dead-ends");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: escrow records + fine-payment bank-transaction picker suppress stale reads on failure and offer exact refetch() recovery"
  );
}

function selftest() {
  const { escrowSrc, fineSrc } = readAll();
  const baseline = check(escrowSrc, fineSrc);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: escrow rows no longer suppressed on error (the exact pre-fix shape).
  const offenderA = escrowSrc.replace(
    "const rowsAll = escrowQuery.isError ? [] : (escrowQuery.data?.records ?? []);",
    "const rowsAll = escrowQuery.data?.records ?? [];"
  );
  if (offenderA === escrowSrc) {
    console.error("FAIL(selftest): offender A mutation did not change EscrowRecordTab.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, fineSrc);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (escrow stale-rows suppression removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: escrow retry button removed.
  const offenderB = escrowSrc.replace(
    /\s*<button[\s\S]*?data-testid="escrow-records-retry"[\s\S]*?<\/button>/,
    ""
  );
  if (offenderB === escrowSrc) {
    console.error("FAIL(selftest): offender B mutation did not change EscrowRecordTab.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB, fineSrc);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (escrow retry button removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: fine-payment bank options no longer suppressed on error.
  const offenderC = fineSrc.replace(
    "bankTxQuery.isError\n        ? []\n        : (bankTxQuery.data?.transactions ?? []).map",
    "(bankTxQuery.data?.transactions ?? []).map"
  );
  if (offenderC === fineSrc) {
    console.error("FAIL(selftest): offender C mutation did not change FineLifecycleActions.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(escrowSrc, offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (bank-options stale suppression removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 4: fine-payment retry button removed.
  const offenderD = fineSrc.replace(
    /\s*<button[\s\S]*?data-testid="fine-payment-picker-retry"[\s\S]*?<\/button>/,
    ""
  );
  if (offenderD === fineSrc) {
    console.error("FAIL(selftest): offender D mutation did not change FineLifecycleActions.tsx — pattern out of sync");
    process.exit(1);
  }
  const failuresD = check(escrowSrc, offenderD);
  if (failuresD.length === 0) {
    console.error("FAIL(selftest): planted offender (fine-payment retry button removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 4 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
