export default {
  name: "verify-vendor-bill-memo-preserves-operator-tag",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vendor-bill-memo-preserves-operator-tag.mjs"]);
  },
};
