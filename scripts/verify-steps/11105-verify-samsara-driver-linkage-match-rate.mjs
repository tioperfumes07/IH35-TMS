export default {
  name: "verify-samsara-driver-linkage-match-rate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-samsara-driver-linkage-match-rate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-samsara-driver-linkage-match-rate.mjs"]);
  },
};
