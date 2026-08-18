export default {
  name: "verify-cash-flow-statement-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-statement-print-letter.mjs"]);
  },
};
