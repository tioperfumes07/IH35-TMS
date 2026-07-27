export default {
  name: "verify-fixed-asset-classes-seeded",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fixed-asset-classes-seeded.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fixed-asset-classes-seeded.mjs"]);
  },
};
