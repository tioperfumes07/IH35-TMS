export default {
  name: "verify:non-accounting-referenceselect-coverage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-non-accounting-referenceselect-coverage.mjs"]);
  },
};
