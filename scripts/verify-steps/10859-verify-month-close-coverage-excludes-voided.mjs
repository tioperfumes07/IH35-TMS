export default {
  name: "verify-month-close-coverage-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-month-close-coverage-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-month-close-coverage-excludes-voided.mjs"]);
  },
};
