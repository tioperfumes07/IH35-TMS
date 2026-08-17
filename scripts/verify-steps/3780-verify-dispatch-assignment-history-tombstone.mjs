export default {
  name: "verify-dispatch-assignment-history-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-assignment-history-tombstone.mjs"]);
  },
};
