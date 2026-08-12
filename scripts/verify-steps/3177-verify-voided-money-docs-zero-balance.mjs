// verify-steps wrapper for scripts/verify-voided-money-docs-zero-balance.mjs
// (ACCT-F376, verify-step 3177). Same shape as verify-steps/3173-*.mjs and siblings — the guard is a
// standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY
// WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-voided-money-docs-zero-balance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-voided-money-docs-zero-balance.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-voided-money-docs-zero-balance.mjs"]);
  },
};
