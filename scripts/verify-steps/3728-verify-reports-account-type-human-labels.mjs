export default {
  name: "verify-reports-account-type-human-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-account-type-human-labels.mjs"]);
  },
};
