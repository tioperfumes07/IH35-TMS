export default {
  name: "verify-driver-team-member-honest-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-team-member-honest-label.mjs"]);
  },
};
