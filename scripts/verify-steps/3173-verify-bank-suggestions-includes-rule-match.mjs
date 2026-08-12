// verify-steps wrapper for scripts/verify-bank-suggestions-includes-rule-match.mjs
// (ACCT-F375, verify-step 3173). Same shape as verify-steps/3153-*.mjs and siblings — the guard is a
// standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY
// WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-bank-suggestions-includes-rule-match",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-suggestions-includes-rule-match.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-suggestions-includes-rule-match.mjs"]);
  },
};
