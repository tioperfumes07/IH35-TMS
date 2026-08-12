// verify-steps wrapper for scripts/verify-driver-profile-settlement-reverse-link.mjs
// (P30 settlement reverse-link, verify-step 3123). Same shape as
// verify-steps/3119-verify-banking-matchdrawer-uses-paritydrawer.mjs — the guard is a standalone
// scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY WIRED per
// verify-guard-wired.mjs.
export default {
  name: "verify-driver-profile-settlement-reverse-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-settlement-reverse-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-profile-settlement-reverse-link.mjs"]);
  },
};
