export default {
  name: "verify-cardlink-plain-click-selects-in-place",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cardlink-plain-click-selects-in-place.mjs"]);
  },
};
