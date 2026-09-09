export default {
  name: "verify-pending-categorization-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pending-categorization-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-pending-categorization-excludes-voided.mjs"]);
  },
};
