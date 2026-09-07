export default {
  name: "verify-customer-create-rejects-sample-data-fixture",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-create-rejects-sample-data-fixture.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-create-rejects-sample-data-fixture.mjs"]);
  },
};
