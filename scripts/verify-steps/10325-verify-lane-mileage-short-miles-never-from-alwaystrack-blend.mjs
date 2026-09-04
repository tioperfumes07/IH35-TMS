export default {
  name: "verify-lane-mileage-short-miles-never-from-alwaystrack-blend",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lane-mileage-short-miles-never-from-alwaystrack-blend.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lane-mileage-short-miles-never-from-alwaystrack-blend.mjs"]);
  },
};
