export default {
  name: "verify-settlement-poster-stamps-bill-driver-id",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-poster-stamps-bill-driver-id.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-poster-stamps-bill-driver-id.mjs"]);
  },
};
