// LST-PICKER-01 NewAccountDrawerForm parent account inline create (claim 1884).
export default {
  name: "verify-lst-picker01-new-account-parent-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-new-account-parent-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-new-account-parent-inline-create.mjs"]);
  },
};
