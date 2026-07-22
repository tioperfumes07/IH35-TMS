export default {
  name: "verify-fleet-profile-no-dual-activity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-profile-no-dual-activity.mjs"]);
  },
};
