export default {
  name: "verify-finance-loan-wizard-no-native-date-type",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-loan-wizard-no-native-date-type.mjs"]);
  },
};
