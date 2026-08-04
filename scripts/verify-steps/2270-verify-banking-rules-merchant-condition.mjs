export default {
  name: "verify-banking-rules-merchant-condition",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-rules-merchant-condition.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-rules-merchant-condition.mjs"]);
  },
};
