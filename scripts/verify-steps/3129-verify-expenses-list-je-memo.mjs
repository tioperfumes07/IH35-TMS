// verify-steps wrapper for scripts/verify-expenses-list-je-memo.mjs
// (CLS-LINKAGE-ONEWAY instance, Expense -> JE list view, verify-step 3129). Same shape as
// verify-steps/3125-verify-qbo-sync-bill-payment-phantom-column.mjs and siblings — the guard is a
// standalone scripts/verify-*.mjs (static, no DB needed) and this wrapper is what makes it FULLY
// WIRED per verify-guard-wired.mjs.
export default {
  name: "verify-expenses-list-je-memo",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expenses-list-je-memo.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-expenses-list-je-memo.mjs"]);
  },
};
