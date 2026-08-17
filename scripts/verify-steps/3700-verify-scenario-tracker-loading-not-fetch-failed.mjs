export default {
  name: "verify-scenario-tracker-loading-not-fetch-failed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-scenario-tracker-loading-not-fetch-failed.mjs"]);
  },
};
