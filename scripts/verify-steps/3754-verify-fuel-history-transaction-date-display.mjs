export default {
  name: "verify-fuel-history-transaction-date-display",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-history-transaction-date-display.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-history-transaction-date-display.mjs"]);
  },
};
