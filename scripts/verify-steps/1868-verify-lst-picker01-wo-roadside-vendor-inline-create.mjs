// LST-PICKER-01 Create WO roadside provider vendor inline create (claim 1868).
export default {
  name: "verify-lst-picker01-wo-roadside-vendor-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-wo-roadside-vendor-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-wo-roadside-vendor-inline-create.mjs"]);
  },
};
