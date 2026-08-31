export default {
  name: "verify-dispatch-load-detail-in-transit-button",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-load-detail-in-transit-button.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-load-detail-in-transit-button.mjs"]);
  },
};
