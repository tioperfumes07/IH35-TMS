export default {
  name: "verify-load-close-lifecycle-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-close-lifecycle-wired.mjs"]);
  },
};
