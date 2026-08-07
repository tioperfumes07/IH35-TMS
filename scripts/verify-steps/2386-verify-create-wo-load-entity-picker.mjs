export default {
  name: "verify-create-wo-load-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-create-wo-load-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-create-wo-load-entity-picker.mjs"]);
  },
};
