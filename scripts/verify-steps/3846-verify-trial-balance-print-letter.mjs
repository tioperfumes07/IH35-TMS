export default {
  name: "verify-trial-balance-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-trial-balance-print-letter.mjs"]);
  },
};
