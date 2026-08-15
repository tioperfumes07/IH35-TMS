export default {
  name: "verify-fixed-asset-depreciation-je-reverse-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fixed-asset-depreciation-je-reverse-link.mjs"]);
  },
};
