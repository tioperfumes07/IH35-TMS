export default {
  name: "verify-qbo-sync-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-sync-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-sync-excludes-voided.mjs"]);
  },
};
