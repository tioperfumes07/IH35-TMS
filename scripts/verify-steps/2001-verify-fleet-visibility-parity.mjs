export default {
  name: "verify-fleet-visibility-parity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-visibility-parity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-fleet-visibility-parity.mjs"]);
    await ctx.run("node", ["scripts/verify-operator-surfaces-exclude-test-data.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-operator-surfaces-exclude-test-data.mjs"]);
  },
};
