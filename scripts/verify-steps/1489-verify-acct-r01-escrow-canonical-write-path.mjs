// ACCT-R-01 (0007-pattern-5 escrow split-brain) — driver_finance escrow-balance writers must stay
// synced with the canonical GL liability balance (accounting.escrow_accounts).
export default {
  name: "verify:acct-r01-escrow-canonical-write-path",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r01-escrow-canonical-write-path.mjs"]);
  },
};
