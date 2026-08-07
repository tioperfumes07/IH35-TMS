export default {
  name: "verify-cust-verify-01",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-verify-01.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-verify-01.mjs"]);
  },
};
