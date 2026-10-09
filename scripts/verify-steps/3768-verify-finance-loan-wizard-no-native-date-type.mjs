export default {
  name: "verify-finance-loan-wizard-no-native-date-type",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-finance-loan-wizard-no-native-date-type.mjs"]);
    await ctx.run("node", ["scripts/verify-91086-invcreate-recordexp-basis-slate-leftover-chrome.mjs"]);
  },
};
