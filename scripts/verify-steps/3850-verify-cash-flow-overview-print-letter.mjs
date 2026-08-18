export default {
  name: "verify-cash-flow-overview-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-overview-print-letter.mjs"]);
  },
};
