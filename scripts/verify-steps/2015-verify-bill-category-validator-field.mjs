export default {
  name: "verify-bill-category-validator-field",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-category-validator-field.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bill-category-validator-field.mjs"]);
  },
};
