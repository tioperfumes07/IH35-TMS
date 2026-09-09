export default {
  name: "verify-bulk-transactions-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bulk-transactions-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bulk-transactions-excludes-voided.mjs"]);
  },
};
