export default {
  name: "verify-usmca-settlement-linkage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-settlement-linkage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-usmca-settlement-linkage.mjs"]);
  },
};
