export default {
  name: "verify-bills-mdata-vendor-backfill-pass3",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bills-mdata-vendor-backfill-pass3.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bills-mdata-vendor-backfill-pass3.mjs"]);
  },
};
