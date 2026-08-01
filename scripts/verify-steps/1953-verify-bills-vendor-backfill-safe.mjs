export default {
  name: "verify-bills-vendor-backfill-safe",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bills-vendor-backfill-safe.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bills-vendor-backfill-safe.mjs"]);
  },
};
