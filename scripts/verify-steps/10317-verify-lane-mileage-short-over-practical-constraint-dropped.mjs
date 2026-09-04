export default {
  name: "verify-lane-mileage-short-over-practical-constraint-dropped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lane-mileage-short-over-practical-constraint-dropped.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-lane-mileage-short-over-practical-constraint-dropped.mjs"]);
  },
};
