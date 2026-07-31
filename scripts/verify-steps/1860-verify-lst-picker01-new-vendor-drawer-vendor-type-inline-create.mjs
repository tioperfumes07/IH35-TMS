// LST-PICKER-01 nested vendor create vendor_type inline create (claim 1860).
export default {
  name: "verify-lst-picker01-new-vendor-drawer-vendor-type-inline-create",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-lst-picker01-new-vendor-drawer-vendor-type-inline-create.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-lst-picker01-new-vendor-drawer-vendor-type-inline-create.mjs"]);
  },
};
