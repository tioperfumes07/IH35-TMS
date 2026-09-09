export default {
  name: "verify-resettlement-origin-load-dates",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-resettlement-origin-load-dates.mjs"]);
  },
};
