export default {
  name: "verify-fixed-asset-half-year-convention",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fixed-asset-half-year-convention.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fixed-asset-half-year-convention.mjs"]);
  },
};
