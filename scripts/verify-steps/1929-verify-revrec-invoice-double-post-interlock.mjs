export default {
  name: "verify-revrec-invoice-double-post-interlock",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-revrec-invoice-double-post-interlock.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-revrec-invoice-double-post-interlock.mjs"]);
  },
};
