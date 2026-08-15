export default {
  name: "verify-lists-back-to-main-hub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-back-to-main-hub.mjs"]);
  },
};
