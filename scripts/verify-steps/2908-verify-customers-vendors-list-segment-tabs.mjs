export default {
  name: "verify-customers-vendors-list-segment-tabs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customers-vendors-list-segment-tabs.mjs"]);
  },
};
