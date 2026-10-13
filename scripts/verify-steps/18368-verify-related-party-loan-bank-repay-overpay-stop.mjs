export default {
  name: "verify-related-party-loan-bank-repay-overpay-stop",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-bank-repay-overpay-stop.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-bank-repay-overpay-stop.mjs"]);
  },
};
