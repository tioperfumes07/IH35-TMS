// LST-PICKER-01 NewServiceDrawerForm class + category inline create (claim 1876).
export default {
  name: "verify-lst-picker01-service-class-category-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-service-class-category-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-service-class-category-inline-create.mjs"]);
  },
};
