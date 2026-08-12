// verify-steps wrapper for scripts/verify-void-reversal-posting-source-tagged.mjs
// (LV-BILLPAY-VOID-NO-REVERSAL sub-finding — ACCT-F369, verify-step 3157). Same shape as
// verify-steps/3153-verify-ap-bills-void-spelling.mjs and siblings — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-void-reversal-posting-source-tagged",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-reversal-posting-source-tagged.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-void-reversal-posting-source-tagged.mjs"]);
  },
};
