export default {
  name: "verify-invoice-type-load-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-type-load-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-type-load-entity-picker.mjs"]);
  },
};
