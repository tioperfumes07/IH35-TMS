export default {
  name: "verify-cash-flow-coverage-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-coverage-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cash-flow-coverage-excludes-voided.mjs"]);
  },
};
