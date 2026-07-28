export default {
  name: "verify-depreciation-posts-on-owner-entity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-depreciation-posts-on-owner-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-depreciation-posts-on-owner-entity.mjs"]);
  },
};