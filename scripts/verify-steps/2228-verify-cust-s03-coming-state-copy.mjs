export default {
  name: "verify-cust-s03-coming-state-copy",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-s03-coming-state-copy.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-s03-coming-state-copy.mjs"]);
  },
};
