export default {
  name: "verify-customer-types-seed-backfill",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-types-seed-backfill.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-customer-types-seed-backfill.mjs"]);
  },
};
