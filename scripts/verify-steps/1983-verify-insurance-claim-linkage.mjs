export default {
  name: "verify-insurance-claim-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-insurance-claim-linkage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-insurance-claim-linkage.mjs"]);
  },
};
