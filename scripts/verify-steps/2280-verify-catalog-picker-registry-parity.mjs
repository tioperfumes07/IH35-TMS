export default {
  name: "verify-catalog-picker-registry-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-catalog-picker-registry-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-catalog-picker-registry-parity.mjs"]);
  },
};
