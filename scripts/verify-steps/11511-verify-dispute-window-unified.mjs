export default {
  name: "verify-dispute-window-unified",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispute-window-unified.mjs"]);
  },
};
