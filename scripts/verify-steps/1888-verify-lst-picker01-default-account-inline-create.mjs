// LST-PICKER-01 vendor/customer default account inline create (claim 1888).
export default {
  name: "verify-lst-picker01-default-account-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-default-account-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-default-account-inline-create.mjs"]);
  },
};
