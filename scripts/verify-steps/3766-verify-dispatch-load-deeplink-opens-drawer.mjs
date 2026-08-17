export default {
  name: "verify-dispatch-load-deeplink-opens-drawer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-load-deeplink-opens-drawer.mjs"]);
  },
};
