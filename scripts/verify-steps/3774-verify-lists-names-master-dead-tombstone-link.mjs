export default {
  name: "verify-lists-names-master-dead-tombstone-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-names-master-dead-tombstone-link.mjs"]);
  },
};
