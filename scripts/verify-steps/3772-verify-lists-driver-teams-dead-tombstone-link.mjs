export default {
  name: "verify-lists-driver-teams-dead-tombstone-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-driver-teams-dead-tombstone-link.mjs"]);
  },
};
