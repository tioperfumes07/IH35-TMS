export default {
  name: "verify-hoverdropdown-click-after-hover",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hoverdropdown-click-after-hover.mjs"]);
  },
};
