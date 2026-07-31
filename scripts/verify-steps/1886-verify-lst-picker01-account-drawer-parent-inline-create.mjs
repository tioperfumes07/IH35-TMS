// LST-PICKER-01 AccountDrawer parent account inline create (claim 1886).
export default {
  name: "verify-lst-picker01-account-drawer-parent-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-account-drawer-parent-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-account-drawer-parent-inline-create.mjs"]);
  },
};
