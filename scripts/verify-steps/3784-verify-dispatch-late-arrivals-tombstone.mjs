export default {
  name: "verify-dispatch-late-arrivals-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-late-arrivals-tombstone.mjs"]);
  },
};
