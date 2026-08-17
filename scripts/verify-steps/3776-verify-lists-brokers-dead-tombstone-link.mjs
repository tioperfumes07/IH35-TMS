export default {
  name: "verify-lists-brokers-dead-tombstone-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-brokers-dead-tombstone-link.mjs"]);
  },
};
