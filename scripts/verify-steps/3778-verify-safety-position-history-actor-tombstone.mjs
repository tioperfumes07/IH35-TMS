export default {
  name: "verify-safety-position-history-actor-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-position-history-actor-tombstone.mjs"]);
  },
};
