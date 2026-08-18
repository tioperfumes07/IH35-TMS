export default {
  name: "verify-load-drawer-stops-picker-law",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-drawer-stops-picker-law.mjs"]);
  },
};
