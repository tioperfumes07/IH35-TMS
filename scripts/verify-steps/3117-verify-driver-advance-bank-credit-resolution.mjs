// verify-steps wrapper for scripts/verify-driver-advance-bank-credit-resolution.mjs
// (CLS-CASH-OUT-CREDITS-CLEARING-ACCOUNT / ACCT-F358, verify-step 3117). Same shape as
// verify-steps/3109-verify-flag-keys-seeded.mjs / 3113-verify-settlement-detail-load-coalesce.mjs —
// the guard is a standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes
// it FULLY WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-driver-advance-bank-credit-resolution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-advance-bank-credit-resolution.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-advance-bank-credit-resolution.mjs"]);
  },
};
