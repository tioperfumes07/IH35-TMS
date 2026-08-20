export default {
  name: "verify-customer-type-picker-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-type-picker-law.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-type-picker-law.mjs"]);
  },
};
