// verify-steps wrapper for scripts/verify-ap-bill-number-not-load-number.mjs
// (AP-BILL-NUMBER-IS-THE-LOAD-NUMBER, verify-step 3141). Same shape as
// verify-steps/3137-verify-insurance-policy-opco-insert.mjs and siblings — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-ap-bill-number-not-load-number",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-bill-number-not-load-number.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ap-bill-number-not-load-number.mjs"]);
  },
};
