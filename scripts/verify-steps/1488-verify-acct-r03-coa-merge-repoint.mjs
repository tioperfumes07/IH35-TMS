export default {
  name: "verify-acct-r03-coa-merge-repoint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-r03-coa-merge-repoint.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-acct-r03-coa-merge-repoint.mjs"]);
  },
};
