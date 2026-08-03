export default {
  name: "verify-saf-integrity-reports-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-integrity-reports-entitylink.mjs"]);
  },
};
