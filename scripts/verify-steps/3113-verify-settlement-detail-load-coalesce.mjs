// verify-steps wrapper for scripts/verify-settlement-detail-load-coalesce.mjs
// (SETTLEMENT-DETAIL-LOAD-COALESCE-DRIFT, verify-step 3113). Same shape as
// verify-steps/1213-verify-chain-04-bill-payment-bank-tieout.mjs / 3109-verify-flag-keys-seeded.mjs —
// the guard itself is a standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is
// what makes it FULLY WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-settlement-detail-load-coalesce",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-detail-load-coalesce.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-detail-load-coalesce.mjs"]);
  },
};
