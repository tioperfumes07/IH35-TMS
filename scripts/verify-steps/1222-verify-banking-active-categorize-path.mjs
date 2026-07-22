// Rule 17 — auto-discovered verify-step for banking categorize active-path guard.
// Locks Workflow-B (BankTxCategorizationPage) off the router; live surface = BankingTransactionsDesignView.
export default {
  name: "banking-active-categorize-path",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-banking-active-categorize-path.mjs", "--selftest"]) !== 0) {
      return 1;
    }
    if (ctx.run("node", ["scripts/verify-banking-active-categorize-path.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
