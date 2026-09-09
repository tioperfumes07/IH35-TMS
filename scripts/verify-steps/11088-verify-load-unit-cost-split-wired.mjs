export default {
  name: "verify-load-unit-cost-split-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-unit-cost-split-wired.mjs"]);
  },
};
