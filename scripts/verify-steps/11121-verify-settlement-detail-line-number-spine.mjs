export default {
  name: "verify-settlement-detail-line-number-spine",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-detail-line-number-spine.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-detail-line-number-spine.mjs"]);
  },
};
