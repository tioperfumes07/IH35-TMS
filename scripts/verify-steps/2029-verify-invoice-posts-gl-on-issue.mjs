export default {
  name: "verify-invoice-posts-gl-on-issue",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-posts-gl-on-issue.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-posts-gl-on-issue.mjs"]);
  },
};
