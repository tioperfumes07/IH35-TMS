// LST-PICKER-01 NewServiceDrawerForm account inline create (claim 1872).
export default {
  name: "verify-lst-picker01-service-account-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-service-account-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-service-account-inline-create.mjs"]);
  },
};
