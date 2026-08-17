export default {
  name: "verify-vendor-credits-vendor-id-safe-cast",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-credits-vendor-id-safe-cast.mjs"]);
  },
};
