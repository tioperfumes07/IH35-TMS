export default {
  name: "verify-cash-advance-load-trailer-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advance-load-trailer-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cash-advance-load-trailer-entity-picker.mjs"]);
  },
};
