export default {
  name: "verify-bank-accounts-reorder-control",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-accounts-reorder-control.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-accounts-reorder-control.mjs"]);
  },
};
