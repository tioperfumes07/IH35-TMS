// LST-PICKER-01 QuickCreate item income/expense account inline create (claim 1890).
export default {
  name: "verify-lst-picker01-quickcreate-item-account-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-quickcreate-item-account-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-quickcreate-item-account-inline-create.mjs"]);
  },
};
