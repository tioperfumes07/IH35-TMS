export default {
  name: "verify-lane-mileage-merge-and-rescore",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lane-mileage-merge-and-rescore.mjs"]);
  },
};
