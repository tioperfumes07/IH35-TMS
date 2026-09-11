#!/usr/bin/env node
// SETTLE-SWEEP (GPT financial review, docs/bus/OUTBOX-GPT.md "SETTLE-SWEEP Settlement Close
// MEASURED/CONFIRMED"): SettlementCloseArrivalPage.tsx collected a payment method via
// PaymentMethodPicker but `closeMut` only ever called `settleAndPay` (approve + PDF + notify) --
// the picked account/payment_method_id was never used to post the GL entry. `closeSettlementPayRun`
// (the ONLY live GL poster for a driver settlement, per docs/audit/SETL-POST-01-DRY-RUN-2026-09-06.md)
// is a separate, complementary action that PayRunClosePanel.tsx already calls correctly.
//
// This guard statically asserts the fix holds: SettlementCloseArrivalPage's close mutation must
// (a) still call settleAndPay (approve+notify, unchanged), (b) also call closeSettlementPayRun with
// the picked payment_method_id when one is selected, and (c) catch a known "needs a human decision"
// error code instead of throwing it -- because several close-time decisions (an outstanding driver
// loan, a net-pay floor breach, a missing per-driver escrow account) are interactive by design
// (SET-05, GO-22 B7) and this page does not attempt to rebuild PayRunClosePanel's dedicated UI for
// them; a refusal must be surfaced honestly, never guessed at or silently swallowed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const PAGE = path.join(repoRoot, "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx");

/** Pure: does this file's source wire payment_method_id into a real payrun-close call? */
export function auditSettlementClosePageSource(src) {
  const failures = [];
  if (!/closeSettlementPayRun\s*\(/.test(src)) {
    failures.push("no call to closeSettlementPayRun found -- the picked payment method is not used to post anything");
  }
  if (!/settleAndPay\s*\(/.test(src)) {
    failures.push("settleAndPay call removed -- approve+PDF+notify must still happen (this is additive, not a replacement)");
  }
  if (!/payment_method_id:\s*paymentMethodId/.test(src)) {
    failures.push("closeSettlementPayRun is not called with payment_method_id: paymentMethodId -- the picked account is still discarded");
  }
  // Must not blindly throw/crash on a known human-decision-required refusal -- must catch and
  // branch, not let it bubble as an unhandled "Close failed" toast indistinguishable from a real bug.
  if (!/PAYRUN_NEEDS_HUMAN_REVIEW_CODES/.test(src)) {
    failures.push("no PAYRUN_NEEDS_HUMAN_REVIEW_CODES handling found -- a refusal like OUTSTANDING_LOAN_DECISION_REQUIRED would surface as an opaque failure instead of an honest 'finish from Pay Run Close' message");
  }
  if (!/OUTSTANDING_LOAN_DECISION_REQUIRED/.test(src)) {
    failures.push("OUTSTANDING_LOAN_DECISION_REQUIRED is not in the handled-refusal set");
  }
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const bad = `
    const closeMut = useMutation({
      mutationFn: () => settleAndPay(String(id), companyId),
    });
  `;
  const badFailures = auditSettlementClosePageSource(bad);
  assert.ok(badFailures.length >= 3, "the pre-fix shape (settleAndPay only) must fail on multiple checks");

  const good = `
    const PAYRUN_NEEDS_HUMAN_REVIEW_CODES = new Set(["OUTSTANDING_LOAN_DECISION_REQUIRED"]);
    const closeMut = useMutation({
      mutationFn: async () => {
        await settleAndPay(settlementId, companyId);
        if (!paymentMethodId) return { posted: false, needsReview: null };
        try {
          await closeSettlementPayRun(settlementId, { operating_company_id: companyId, payment_method_id: paymentMethodId });
          return { posted: true, needsReview: null };
        } catch (err) {
          const code = extractPayRunErrorCode(err);
          if (PAYRUN_NEEDS_HUMAN_REVIEW_CODES.has(code)) return { posted: false, needsReview: code };
          throw err;
        }
      },
    });
  `;
  const goodFailures = auditSettlementClosePageSource(good);
  assert.ok(goodFailures.length === 0, "the fixed shape must pass all checks: " + JSON.stringify(goodFailures));

  console.log("verify-settlement-close-posts-payrun --selftest PASS");
}

function run() {
  if (!fs.existsSync(PAGE)) {
    console.error(`verify-settlement-close-posts-payrun FAILED: ${path.relative(repoRoot, PAGE)} missing`);
    process.exit(1);
  }
  const src = fs.readFileSync(PAGE, "utf8");
  const failures = auditSettlementClosePageSource(src);
  if (failures.length) {
    console.error("verify-settlement-close-posts-payrun FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-settlement-close-posts-payrun: OK -- SettlementCloseArrivalPage posts the picked payment " +
      "method through closeSettlementPayRun, and honestly surfaces (never swallows or guesses at) a " +
      "human-decision-required refusal"
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
