// LST-PICKER-01 parent customer inline create (claim 1870).
export default {
  name: "verify-lst-picker01-parent-customer-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-parent-customer-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-parent-customer-inline-create.mjs"]);
  },
};
