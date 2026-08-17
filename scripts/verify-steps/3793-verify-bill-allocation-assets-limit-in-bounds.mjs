export default {
  name: "verify-bill-allocation-assets-limit-in-bounds",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-allocation-assets-limit-in-bounds.mjs"]);
  },
};
