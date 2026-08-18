export default {
  name: "verify-fuel-reconciliation-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-reconciliation-print-letter.mjs"]);
  },
};
