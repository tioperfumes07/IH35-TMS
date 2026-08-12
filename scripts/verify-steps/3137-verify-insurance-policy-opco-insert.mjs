// verify-steps wrapper for scripts/verify-insurance-policy-opco-insert.mjs
// (LV-TXN-014, verify-step 3137). Same shape as verify-steps/3129-verify-expenses-list-je-memo.mjs and
// siblings — the guard is a standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is
// what makes it FULLY WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-insurance-policy-opco-insert",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-policy-opco-insert.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-policy-opco-insert.mjs"]);
  },
};
