export default {
  name: "verify-fine-create-unit-load-entity-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fine-create-unit-load-entity-picker.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fine-create-unit-load-entity-picker.mjs"]);
  },
};
