export default {
  name: "verify-related-party-loan-scentsx-option2-backfill",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-scentsx-option2-backfill.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-scentsx-option2-backfill.mjs"]);
  },
};
