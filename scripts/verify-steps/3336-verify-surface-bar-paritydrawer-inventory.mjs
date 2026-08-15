export default {
  name: "verify-surface-bar-paritydrawer-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-surface-bar-paritydrawer-inventory.mjs"]);
  },
};
