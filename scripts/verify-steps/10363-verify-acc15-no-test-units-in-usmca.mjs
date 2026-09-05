export default {
  name: "verify-acc15-no-test-units-in-usmca",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acc15-no-test-units-in-usmca.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acc15-no-test-units-in-usmca.mjs"]);
  },
};
