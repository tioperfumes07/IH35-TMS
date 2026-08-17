export default {
  name: "verify-cash-advances-view-load-column-present",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-advances-view-load-column-present.mjs"]);
  },
};
