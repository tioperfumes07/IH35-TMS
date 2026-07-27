export default {
  name: "verify-fuel-gl-posts-exist",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-gl-posts-exist.mjs"]);
  },
};
