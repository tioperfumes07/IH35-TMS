// verify-steps wrapper for scripts/verify-settlement-for-load-reverse-hop.mjs
// (LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING, verify-step 3149). Same shape as
// verify-steps/3113-verify-settlement-detail-load-coalesce.mjs and siblings — the guard is a
// standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY
// WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-settlement-for-load-reverse-hop",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-for-load-reverse-hop.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-for-load-reverse-hop.mjs"]);
  },
};
