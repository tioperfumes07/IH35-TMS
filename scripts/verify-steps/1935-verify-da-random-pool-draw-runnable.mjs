export default {
  name: "verify-da-random-pool-draw-runnable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-da-random-pool-draw-runnable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-da-random-pool-draw-runnable.mjs"]);
    await ctx.run("node", ["scripts/verify-da-pool-compliance.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-da-pool-compliance.mjs"]);
  },
};
