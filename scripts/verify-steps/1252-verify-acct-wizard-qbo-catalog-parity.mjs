export default {
  name: "verify-acct-wizard-qbo-catalog-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-wizard-qbo-catalog-parity.mjs"]);
  },
};
