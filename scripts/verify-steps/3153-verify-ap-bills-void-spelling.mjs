// verify-steps wrapper for scripts/verify-ap-bills-void-spelling.mjs
// (LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS, verify-step 3153). Same shape as
// verify-steps/3149-verify-settlement-for-load-reverse-hop.mjs and siblings — the guard is a
// standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY
// WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-ap-bills-void-spelling",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-bills-void-spelling.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ap-bills-void-spelling.mjs"]);
  },
};
