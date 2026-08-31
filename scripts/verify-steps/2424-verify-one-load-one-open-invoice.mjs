export default {
  name: "verify-one-load-one-open-invoice",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-one-load-one-open-invoice.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-one-load-one-open-invoice.mjs"]);
  },
};
