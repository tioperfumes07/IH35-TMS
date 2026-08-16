export default {
  name: "verify-bill-header-only-refused",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-header-only-refused.mjs"]);
  },
};
