export default {
  name: "verify-dispatch-border-crossing-history-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-border-crossing-history-tombstone.mjs"]);
  },
};
