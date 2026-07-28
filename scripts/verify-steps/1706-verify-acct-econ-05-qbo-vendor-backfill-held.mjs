export default {
  name: "verify-acct-econ-05-qbo-vendor-backfill-held",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-econ-05-qbo-vendor-backfill-held.mjs"]);
  },
};
