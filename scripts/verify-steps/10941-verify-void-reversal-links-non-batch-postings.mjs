export default {
  name: "verify-void-reversal-links-non-batch-postings",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-void-reversal-links-non-batch-postings.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-void-reversal-links-non-batch-postings.mjs"]);
  },
};
