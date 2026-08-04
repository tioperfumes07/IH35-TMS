export default {
  name: "verify-homepage-scenario-tracker-staleness",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-homepage-scenario-tracker-staleness.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-homepage-scenario-tracker-staleness.mjs"]);
  },
};
