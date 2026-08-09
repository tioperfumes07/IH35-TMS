export default {
  name: "verify-driver-active-30d-activity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-active-30d-activity.mjs"]);
  },
};
