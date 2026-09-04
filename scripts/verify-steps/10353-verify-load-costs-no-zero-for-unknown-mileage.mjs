export default {
  name: "verify-load-costs-no-zero-for-unknown-mileage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-no-zero-for-unknown-mileage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-no-zero-for-unknown-mileage.mjs"]);
  },
};
