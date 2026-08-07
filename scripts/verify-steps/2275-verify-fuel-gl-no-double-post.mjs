export default {
  name: "verify-fuel-gl-no-double-post",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-gl-no-double-post.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fuel-gl-no-double-post.mjs"]);
  },
};
