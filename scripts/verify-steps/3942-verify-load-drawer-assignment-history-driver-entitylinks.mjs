export default {
  name: "verify-load-drawer-assignment-history-driver-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-drawer-assignment-history-driver-entitylinks.mjs"]);
  },
};
