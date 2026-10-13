export default {
  name: "verify-related-party-loan-backfill-proposal",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-backfill-proposal.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-backfill-proposal.mjs"]);
  },
};
