export default {
  name: "verify-lst-picker01-customer-quality-reason-inline-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker01-customer-quality-reason-inline-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lst-picker01-customer-quality-reason-inline-create.mjs"]);
  },
};
