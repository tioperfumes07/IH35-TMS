export default {
  name: "verify-border-wizard-broker-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-border-wizard-broker-entitylink.mjs"]);
  },
};
