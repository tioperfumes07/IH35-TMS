export default {
  name: "verify-dispatch-trip-pairing-in-board-view-row",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-trip-pairing-in-board-view-row.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-trip-pairing-in-board-view-row.mjs"]);
  },
};
