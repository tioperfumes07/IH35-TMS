export default {
  name: "verify-related-party-loan-integrity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-related-party-loan-integrity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-related-party-loan-integrity.mjs"]);
  },
};
