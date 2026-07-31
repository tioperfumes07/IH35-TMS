// LST-PICKER-01 NewServiceDrawerForm preferred vendor inline create (claim 1874).
export default {
  name: "verify-lst-picker01-service-preferred-vendor-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-service-preferred-vendor-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-service-preferred-vendor-inline-create.mjs"]);
  },
};
