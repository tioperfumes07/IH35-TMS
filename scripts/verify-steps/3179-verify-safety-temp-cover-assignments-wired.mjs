// verify-steps wrapper for scripts/verify-safety-temp-cover-assignments-wired.mjs
// (SAFETY-TEMP-COVER-ASSIGNMENTS-ZERO-FE-CALLERS, verify-step 3179). Same shape as
// verify-steps/3175-verify-bank-account-detail-transfers-reverse-link.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-safety-temp-cover-assignments-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-temp-cover-assignments-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-temp-cover-assignments-wired.mjs"]);
  },
};
