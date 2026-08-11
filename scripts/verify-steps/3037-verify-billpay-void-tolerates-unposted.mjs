#!/usr/bin/env node
/**
 * ACCT-F327 — a bill payment with NO posted GL batch could never be voided, and it took its bill
 * with it.
 *
 * voidBillPaymentInClientTx decided whether to reverse GL from `settlement_deduction_noncash !== true`
 * — an ASSUMPTION that every non-deduction payment has a posted batch. A payment written while
 * BILL_PAYMENT_GL_POSTING_ENABLED was OFF (or whose post failed and was surfaced as unposted) has
 * none, so reversePostedSourceTransactionInClientTx threw SOURCE_NOT_FOUND ("No posted batch found to
 * reverse") and the whole void aborted. The payment was permanently unvoidable, and the bill it paid
 * could never be voided either. Proven on prod executing the owner's void-all: 2 payments with
 * was_posted=false blocked 2 bills.
 *
 * The invariant: reversal must be driven by whether a posting EXISTS, not by intent alone.
 *
 * It also asserts the fix is NOT a try/catch around the reversal. Swallowing SOURCE_NOT_FOUND would
 * also swallow a genuine reversal failure on a payment that IS posted — turning a loud abort into
 * silent GL loss, which is strictly worse than the bug being fixed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "3037-verify-billpay-void-tolerates-unposted";
const TARGET = path.join(ROOT, "apps/backend/src/accounting/bills.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** The voidBillPaymentInClientTx body. */
function voidPaymentFn(src) {
  const start = src.indexOf("export async function voidBillPaymentInClientTx");
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const endRel = rest.indexOf("\nexport async function ");
  return endRel === -1 ? rest : rest.slice(0, endRel);
}

function audit() {
  const problems = [];
  if (!fs.existsSync(TARGET)) return [`missing ${path.relative(ROOT, TARGET)}`];
  const src = fs.readFileSync(TARGET, "utf8");
  const fn = voidPaymentFn(src);
  if (!fn) {
    return ["could not locate voidBillPaymentInClientTx — the guard cannot verify it and must not pass silently"];
  }

  // The existence probe: the decision must consult journal_entry_postings for this payment.
  const probesPostings =
    /source_transaction_type\s*=\s*'bill_payment'/.test(fn) &&
    /journal_entry_postings/.test(fn) &&
    /(hasPostedBatch|EXISTS\s*\()/i.test(fn);
  if (!probesPostings) {
    problems.push(
      "voidBillPaymentInClientTx does not probe accounting.journal_entry_postings for this payment before reversing — an unposted payment will throw SOURCE_NOT_FOUND and become permanently unvoidable (ACCT-F327)"
    );
  }

  // The reversal must be gated on that probe, not on intent alone.
  if (!/reversePostedGl\s*=\s*[^;]*hasPostedBatch/.test(fn)) {
    problems.push(
      "the reversal decision is not gated on the posted-batch probe — intent alone (settlement_deduction_noncash) is what caused ACCT-F327"
    );
  }

  // Must NOT be "fixed" by swallowing the error. Scoped tightly to the reversal CALL SITE: an earlier
  // draft of this guard used a loose try{...}call regex and fired on an unrelated try block elsewhere
  // in the same function — a false positive on correct code, which is how a guard gets weakened or
  // deleted. Look only at the ~300 chars around the call.
  const callIdx = fn.indexOf("reversePostedSourceTransactionInClientTx");
  if (callIdx !== -1) {
    const before = fn.slice(Math.max(0, callIdx - 200), callIdx);
    const after = fn.slice(callIdx, callIdx + 300);
    const openTryImmediatelyBefore = /try\s*\{[^{}]*$/.test(before);
    if (openTryImmediatelyBefore || /catch\s*\([\s\S]{0,120}SOURCE_NOT_FOUND/.test(after)) {
      problems.push(
        "the reversal call is wrapped in try/catch or catches SOURCE_NOT_FOUND — that also swallows a REAL reversal failure on a posted payment (silent GL loss). Gate on existence instead."
      );
    }
  }

  return problems;
}

function selftest() {
  const original = fs.readFileSync(TARGET, "utf8");
  let planted = 0;

  /**
   * Mutate ONLY inside voidBillPaymentInClientTx. `source_transaction_type = 'bill_payment'` also
   * appears in BILL_PAYMENT_JOURNAL_ENTRY_ID_SQL earlier in this file, so a whole-file replace edited
   * the WRONG occurrence and the selftest reported a false pass — the same failure mode this suite hit
   * on guard 3033. The mutation must land in the code under test.
   */
  const inFn = (mutate) => (s) => {
    const start = s.indexOf("export async function voidBillPaymentInClientTx");
    if (start === -1) return s;
    const rest = s.slice(start + 1);
    const endRel = rest.indexOf("\nexport async function ");
    const end = endRel === -1 ? s.length : start + 1 + endRel;
    return s.slice(0, start) + mutate(s.slice(start, end)) + s.slice(end);
  };

  const mutations = [
    [
      "reverts to intent-only (the original defect)",
      inFn((b) => b.replace(/const reversePostedGl = reversePostedGlIntent && hasPostedBatch;/, "const reversePostedGl = reversePostedGlIntent;")),
    ],
    [
      "posted-batch probe removed",
      inFn((b) => b.replace(/source_transaction_type = 'bill_payment'/, "source_transaction_type = 'disabled_probe'")),
    ],
    [
      "function renamed away (inert-guard detection)",
      (s) => s.replace("export async function voidBillPaymentInClientTx", "export async function voidBillPaymentRenamed"),
    ],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(original);
    if (broken === original) {
      fs.writeFileSync(TARGET, original);
      fail(`selftest INERT: mutation "${name}" did not apply — the guard proves nothing`);
    }
    // Restore BEFORE failing: process.exit() does not run finally blocks.
    fs.writeFileSync(TARGET, broken);
    const stillClean = audit().length === 0;
    fs.writeFileSync(TARGET, original);
    if (stillClean) fail(`selftest: expected FAIL after mutation "${name}"`);
    planted += 1;
  }

  const clean = audit();
  if (clean.length) fail(`selftest cleanup still red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS — bill-payment void reverses on posting EXISTENCE, so an unposted payment still voids`);
}
