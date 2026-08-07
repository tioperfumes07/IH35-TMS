export default {
  name: "verify-incident-trailer-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-incident-trailer-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-incident-trailer-entity-picker.mjs"]);
  },
};
