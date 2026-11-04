// ENG-34 / batch70 — wire orphan verify-balanced-ledger.
// CI runs --selftest only: proves ASSERTIONS SQL shape (entity-scoped balance /
// min-2-lines / reversal-link integrity). LIVE measure REQUIRES_LIVE_DB
// (money-pr / manual); CI has no prod DATABASE_URL.
export default {
  name: "verify:verify-balanced-ledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-balanced-ledger.mjs", "--selftest"]);
  },
};
