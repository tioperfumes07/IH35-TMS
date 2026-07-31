export default {
  name: "verify-lst-picker01-equipment-type-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-equipment-type-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-equipment-type-inline-create.mjs"]);
  },
};
