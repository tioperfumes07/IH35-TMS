export default {
  name: "verify-acc13-no-test-accounts-in-usmca-coa",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acc13-no-test-accounts-in-usmca-coa.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acc13-no-test-accounts-in-usmca-coa.mjs"]);
  },
};
