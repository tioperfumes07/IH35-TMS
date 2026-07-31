export default {
  name: "verify-freshness-union-exemption-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-freshness-union-exemption-parity.mjs"]);
  },
};
