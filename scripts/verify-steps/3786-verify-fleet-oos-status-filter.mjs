export default {
  name: "verify-fleet-oos-status-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-oos-status-filter.mjs"]);
  },
};
