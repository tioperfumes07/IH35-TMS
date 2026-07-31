// LST-PICKER-01 road-service vendor inline create + vendor_id required (claim 1866).
export default {
  name: "verify-lst-picker01-road-service-vendor-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-road-service-vendor-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-road-service-vendor-inline-create.mjs"]);
  },
};
