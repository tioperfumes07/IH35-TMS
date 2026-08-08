// verify-customer-payment-posts-in-caller-tx — ACCT-F165.
// applyPayment moved A/R and then posted the receipt through postSourceTransaction(), which takes its
// OWN pool connection and its OWN transaction. Under READ COMMITTED that second connection cannot see
// the caller's uncommitted payment, so the poster found nothing, returned quietly, and the caller
// committed: A/R moved in the subledger and the ledger never heard about it. This holds every
// customer-payment post to the in-client-tx poster. Selftest first — it plants the pool variant, a
// dropped call and a comment-only "fix" and demands RED on each.
export default {
  name: "verify:customer-payment-posts-in-caller-tx",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-payment-posts-in-caller-tx.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-payment-posts-in-caller-tx.mjs"]);
  },
};
