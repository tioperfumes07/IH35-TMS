#!/usr/bin/env node
/**
 * ACCT-F175 / CLS-VOID-NO-REVERSAL — voiding a bill payment must reverse its GL, and no caller may
 * silently opt out of that by hardcoding the flag off.
 *
 * WHAT WAS BROKEN (live-proven on Neon prod br-fancy-credit-akjnd07a 2026-08-07): `voidBillPayment`
 * — the entry point behind `POST /api/v1/accounting/bill-payments/:id/void`, i.e. the one the UI
 * calls — passed `reversePostedGl: false`, hardcoded. The reversal engine existed and worked; it was
 * simply never asked. Payment `8b68a9d7` ($33.40) was voided at 02:48:58 and its ONLY journal entry
 * is still the original `DR 2000 A/P / CR 1295 Relay Fuel Wallet`, with `reverses_je_id` and
 * `reversed_by_je_id` both NULL. The GL says $33.40 left the wallet and $33.40 of payables was
 * discharged. Neither happened, and the void panel states it posts an equal-and-opposite entry.
 *
 * I CHECKED FOR A REVERSAL BOTH WAYS BEFORE CALLING IT A DEFECT, because the board records a
 * false-negative trap here that has already burned two sessions: a void reversal is posted as a
 * SEPARATE journal entry, NOT by back-filling `reversal_of_line_id` / `reversed_by_line_id` on the
 * original postings — so querying those columns reports "0 reversals" on a correctly-reversed
 * document. This searched `journal_entry_postings.source_transaction_id` AND
 * `journal_entries.memo ILIKE '%<payment id>%'`. Nothing. The absence is real.
 *
 * WHY THE FIX IS A DERIVED DEFAULT AND NOT `reversePostedGl: true`: whether a voided payment has a GL
 * to reverse is a property of the PAYMENT. A non-cash settlement DEDUCTION payment
 * (`settlement_deduction_noncash = true`, `from_bank_account_id` NULL) has no independent entry — the
 * posting engine refuses to post it because its GL is owned by the settlement deduction JE
 * (posting-engine.service.ts:1324) — so reversing it would credit cash that never moved and
 * double-reduce A/P. Forcing `true` would have traded a missing reversal for a phantom one.
 *
 * SO THIS GUARD ASSERTS TWO THINGS, and the second is the one that matters:
 *   1. `voidBillPayment` does not hardcode `reversePostedGl: false` (the exact regression).
 *   2. the derivation still keys on `settlement_deduction_noncash`, so a future edit cannot quietly
 *      turn it into an unconditional `true` and start reversing the one payment kind that must not be.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-billpay-void-reverses-gl";
const FILE = "apps/backend/src/accounting/bills.service.ts";

/**
 * Body of `export async function NAME(...) { … }`, or "" when absent.
 *
 * The parameter list is skipped by matching parentheses FIRST. Taking the next `{` after the name
 * instead looks right and is wrong the moment a function has an inline object parameter — which is
 * exactly the shape here (`input: { operatingCompanyId: string; … }`), so the naive version captured
 * the PARAM TYPE as the body and reported the real, correct file as failing. A guard whose first run
 * accuses working code is a guard people learn to override.
 */
export function functionBody(src, name) {
  const m = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const paren = src.indexOf("(", m.index + m[0].length);
  if (paren === -1) return "";
  let pdepth = 1;
  let p = paren + 1;
  while (p < src.length && pdepth > 0) {
    if (src[p] === "(") pdepth++;
    else if (src[p] === ")") pdepth--;
    p++;
  }
  const open = src.indexOf("{", p);
  if (open === -1) return "";
  let depth = 1;
  let i = open + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return src.slice(open, i);
}

/** Strip line and block comments so a comment quoting the defect cannot satisfy or trip the scan. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export function audit(src) {
  const problems = [];
  const code = stripComments(src);

  const publicVoid = functionBody(code, "voidBillPayment");
  if (!publicVoid) {
    problems.push(
      `${FILE}: no voidBillPayment() found — the entry point this guard anchors on was renamed or ` +
        `removed, so the regression can no longer be detected at all.`
    );
  } else if (/reversePostedGl\s*:\s*false/.test(publicVoid)) {
    problems.push(
      `${FILE} voidBillPayment(): hardcodes reversePostedGl: false. This is the route the UI calls, ` +
        `so voiding a bill payment would post NO reversing entry while the void panel promises one — ` +
        `ACCT-F175, which left $33.40 of cash in the GL that had already left the bank. Omit the flag ` +
        `and let voidBillPaymentInClientTx derive it from the payment row.`
    );
  }

  const inClientTx = functionBody(code, "voidBillPaymentInClientTx");
  if (!inClientTx) {
    problems.push(`${FILE}: no voidBillPaymentInClientTx() found — the derivation cannot be checked.`);
  } else if (!/settlement_deduction_noncash/.test(inClientTx)) {
    problems.push(
      `${FILE} voidBillPaymentInClientTx(): the reversal decision no longer keys on ` +
        `settlement_deduction_noncash. A non-cash settlement deduction has no GL of its own (the ` +
        `posting engine refuses to post it), so reversing it credits cash that never moved and ` +
        `double-reduces A/P. Reversing unconditionally is not a fix — it is the opposite defect.`
    );
  }

  return problems;
}

/** Mutation proof: each case plants the real defect and asserts this guard goes RED. */
function selftest() {
  const failures = [];
  const good = `
export async function voidBillPaymentInClientTx(client, input) {
  const payment = rows[0];
  const reversePostedGl = input.reversePostedGl ?? payment.settlement_deduction_noncash !== true;
  const reversal = reversePostedGl ? await reverse() : null;
}
export async function voidBillPayment(a, b, c, d) {
  return voidBillPaymentInClientTx(client, { paymentId, reason, userId, currentBusinessDate });
}`;
  if (audit(good).length !== 0) failures.push("case1 FAIL — the corrected shape was flagged");

  // case2 — THE DEFECT verbatim: the public entry point hardcodes false.
  const hardcoded = good.replace(
    "{ paymentId, reason, userId, currentBusinessDate }",
    "{ paymentId, reason, userId, reversePostedGl: false, currentBusinessDate }"
  );
  if (audit(hardcoded).length === 0)
    failures.push("case2 FAIL — voidBillPayment hardcoding reversePostedGl: false was NOT caught");

  // case3 — the OPPOSITE defect: reversing unconditionally, which would reverse a non-cash
  // settlement deduction that has no GL and credit cash that never moved.
  const unconditional = good.replace(
    "const reversePostedGl = input.reversePostedGl ?? payment.settlement_deduction_noncash !== true;",
    "const reversePostedGl = true;"
  );
  if (audit(unconditional).length === 0)
    failures.push("case3 FAIL — dropping the settlement_deduction_noncash key was NOT caught");

  // case4 — a renamed/removed entry point must fail loudly rather than pass vacuously.
  if (audit(good.replace("export async function voidBillPayment(", "export async function gone(")).length === 0)
    failures.push("case4 FAIL — a removed voidBillPayment() was NOT caught");

  // case5 — a COMMENT quoting the defect must not trip it (stripComments).
  const commented = good.replace(
    "export async function voidBillPayment(a, b, c, d) {",
    "// historical: this used to pass reversePostedGl: false\nexport async function voidBillPayment(a, b, c, d) {"
  );
  if (audit(commented).length !== 0) failures.push("case5 FAIL — a commented mention of the defect was flagged");

  // case6 — MUTATION AGAINST THE REAL FILE. Every case above is a fixture this author wrote; only the
  // real source proves the shipped fix is what holds this guard green.
  const abs = join(ROOT, FILE);
  if (!existsSync(abs)) {
    failures.push(`case6 FAIL — ${FILE} is missing; the live mutation proof cannot run`);
  } else {
    const real = readFileSync(abs, "utf8");
    if (audit(real).length !== 0) failures.push(`case6 FAIL — the REAL ${FILE} does not satisfy this guard`);
    const mutated = real.replace(
      "const reversePostedGl = input.reversePostedGl ?? payment.settlement_deduction_noncash !== true;",
      "const reversePostedGl = input.reversePostedGl ?? false;"
    );
    if (mutated === real) failures.push(`case6 FAIL — the derivation line was not found in the REAL ${FILE}`);
    else if (audit(mutated).length === 0)
      failures.push(`case6 FAIL — removing the derivation from the REAL ${FILE} left this guard GREEN`);
  }

  return failures;
}

const selfFailures = selftest();
if (selfFailures.length) {
  console.error(`${LABEL} SELFTEST FAILED:\n  ${selfFailures.join("\n  ")}`);
  process.exit(1);
}

const abs = join(ROOT, FILE);
if (!existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${FILE} is missing.`);
  process.exit(1);
}
const problems = audit(readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — bill-payment void reverses its GL, and the non-cash settlement deduction is still excluded`);
