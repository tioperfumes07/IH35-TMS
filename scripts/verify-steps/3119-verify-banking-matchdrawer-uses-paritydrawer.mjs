// verify-steps wrapper for scripts/verify-banking-matchdrawer-uses-paritydrawer.mjs
// (CLS-BANKING-MATCHDRAWER-NOT-PARITYDRAWER, verify-step 3119). Same shape as
// verify-steps/3117-verify-driver-advance-bank-credit-resolution.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-banking-matchdrawer-uses-paritydrawer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-matchdrawer-uses-paritydrawer.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-matchdrawer-uses-paritydrawer.mjs"]);
  },
};
