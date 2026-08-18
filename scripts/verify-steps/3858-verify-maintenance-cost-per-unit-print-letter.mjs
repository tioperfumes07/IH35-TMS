export default {
  name: "verify-maintenance-cost-per-unit-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-cost-per-unit-print-letter.mjs"]);
  },
};
