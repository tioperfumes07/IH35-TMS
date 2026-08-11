export default {
  name: "verify-bank-categorize-recover-box-visible",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-categorize-recover-box-visible.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-categorize-recover-box-visible.mjs"]);
  },
};
