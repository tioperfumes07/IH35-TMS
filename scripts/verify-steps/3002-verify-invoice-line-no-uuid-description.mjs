export default {
  name: "verify-invoice-line-no-uuid-description",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-line-no-uuid-description.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-line-no-uuid-description.mjs"]);
  },
};
