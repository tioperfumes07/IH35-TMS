export default {
  name: "verify-safety-event-detail-list-fallback",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-event-detail-list-fallback.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-event-detail-list-fallback.mjs"]);
  },
};
